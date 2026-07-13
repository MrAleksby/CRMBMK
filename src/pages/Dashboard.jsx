import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection, readClientMoney, invalidate } from '../lib/store'
import ErrorBanner from '../components/ErrorBanner'
import Icon from '../components/Icon'
import Avatar from '../components/Avatar'
import { clientBalances, debtAndPrepaid } from '../lib/balance'
import { isLeadClient, ageLabel, lessonsLabel, plural } from '../lib/client'
import { lessonStudentNames, lessonTypeLabel, isTrial } from '../lib/lesson'
import { todayISO } from '../lib/group'
import {
  lessonsOfDay, lessonStatusInfo, debtors as pickDebtors,
  endingSubscriptions, upcomingBirthdays,
} from '../lib/dashboard'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '16px 18px',
}

const cardTitle = {
  display: 'flex', alignItems: 'center', gap: '8px',
  fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '12px',
}

const empty = { fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }
const nameLink = { fontSize: '13px', fontWeight: '600', color: '#111827', textDecoration: 'none' }

const row = (isLast) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
  padding: '9px 0', borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
})

// Сегодня, завтра, послезавтра — числом дней это читается хуже, чем словом.
const whenLabel = (days) =>
  days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${plural(days, 'день', 'дня', 'дней')}`

export default function Dashboard() {
  const [clients, setClients] = useState([])
  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
  const [lessons, setLessons] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const today = todayISO()

  const fetchData = async (force = false) => {
    setLoadError('')
    // После своей записи читаем заново — и сбрасываем кэш целиком, иначе соседняя
    // страница (например, «Финансы») покажет ленту без только что принятой оплаты.
    if (force) invalidate()
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [cs, tx, ch, ls, subs, ts] = await Promise.all([
        readCollection('clients', { force }),
        readClientMoney({ force }),
        readCollection('charges', { force }),
        readCollection('lessons', { force }),
        readCollection('subscriptions', { force }),
        readCollection('teachers', { force }),
      ])
      setClients(cs)
      setTransactions(tx)
      setCharges(ch)
      setLessons(ls)
      setSubscriptions(subs)
      setTeachers(ts)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const balances = useMemo(() => clientBalances(transactions, charges), [transactions, charges])

  // Карточки лидов лежат в той же коллекции, но учениками ещё не стали —
  // в списке «Клиенты» их нет, и в счётчике быть не должно.
  const students = useMemo(() => clients.filter(c => !isLeadClient(c)), [clients])

  const todayLessons = useMemo(() => lessonsOfDay(lessons, today), [lessons, today])
  const debtorRows = useMemo(() => pickDebtors(clients, balances), [clients, balances])
  const endingRows = useMemo(
    () => endingSubscriptions(clients, subscriptions, balances, charges, { today }),
    [clients, subscriptions, balances, charges, today])
  const birthdayRows = useMemo(() => upcomingBirthdays(clients, { today }), [clients, today])

  const { debt: totalDebt, prepaid: totalPrepaid } = debtAndPrepaid(balances)
  const teacherName = (id) => teachers.find(t => t.id === id)?.name || ''

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  const dateLabel = new Date().toLocaleDateString('ru', {
    day: 'numeric', month: 'long', weekday: 'long',
  })

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon name="dashboard" size={20} style={{ color: '#7c3aed' }} />Дашборд
        </h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          Что делать сегодня — {dateLabel}
        </p>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {/* Цифры дня. Итоги за всё время живут в «Отчётах» — здесь они только мешают. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div style={card}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Занятий сегодня</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#7c3aed', margin: 0 }}>{todayLessons.length}</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Учеников</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 }}>{students.length}</p>
        </div>
        <div style={{
          ...card,
          border: totalDebt > 0 ? '1px solid #fee2e2' : '1px solid #e5e7eb',
          background: totalDebt > 0 ? '#fef2f2' : '#ffffff',
        }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
            Долги {debtorRows.length > 0 && <span style={{ color: '#dc2626' }}>({debtorRows.length})</span>}
          </p>
          <p style={{ fontSize: '16px', fontWeight: '700', color: totalDebt > 0 ? '#dc2626' : '#6b7280', margin: 0 }}>
            {totalDebt.toLocaleString()} сум
          </p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Предоплаты</p>
          <p style={{ fontSize: '16px', fontWeight: '700', color: '#059669', margin: 0 }}>
            {totalPrepaid.toLocaleString()} сум
          </p>
        </div>
      </div>

      {/* Занятия дня — во всю ширину: с них начинается день. */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={cardTitle}>
          <Icon name="lessons" size={16} style={{ color: '#2563eb' }} />Занятия сегодня
          <Link to="/lessons" style={{ marginLeft: 'auto', fontSize: '12px', color: '#7c3aed', textDecoration: 'none' }}>
            Все занятия →
          </Link>
        </div>

        {todayLessons.length === 0 ? (
          <p style={empty}>Занятий на сегодня нет</p>
        ) : todayLessons.map((lesson, i) => {
          const status = lessonStatusInfo(lesson)
          const names = lessonStudentNames(lesson, clients)
          const teacher = teacherName(lesson.teacherId)
          const title = lesson.groupName || (isTrial(lesson) ? '✱ Пробное' : lessonTypeLabel(lesson.type))

          return (
            <div key={lesson.id} style={row(i === todayLessons.length - 1)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>
                    {lesson.timeFrom || '—'}{lesson.timeTo ? `–${lesson.timeTo}` : ''}
                  </span>
                  <span style={{ fontSize: '13px', color: '#111827' }}>{title}</span>
                  <span style={{
                    fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '999px',
                    color: status.color, background: status.background,
                  }}>{status.label}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0' }}>
                  {teacher && `${teacher} · `}
                  {names.length ? names.join(', ') : 'состав не набран'}
                </p>
              </div>
              <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                {plural(names.length, 'ученик', 'ученика', 'учеников')}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {/* Должники */}
        <div style={card}>
          <div style={cardTitle}>
            <Icon name="alert" size={16} style={{ color: '#dc2626' }} />Должники
          </div>
          {debtorRows.length === 0 ? (
            <p style={empty}>Долгов нет</p>
          ) : debtorRows.map(({ client, balance }, i) => (
            <div key={client.id} style={row(i === debtorRows.length - 1)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Avatar client={client} size={26} />
                <Link to={`/clients/${client.id}`} style={nameLink}>{client.childName}</Link>
              </div>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626', whiteSpace: 'nowrap' }}>
                {balance.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* Кончающиеся абонементы */}
        <div style={card}>
          <div style={cardTitle}>
            <Icon name="ticket" size={16} style={{ color: '#b45309' }} />Абонементы на исходе
          </div>
          {endingRows.length === 0 ? (
            <p style={empty}>Все в порядке</p>
          ) : endingRows.map(({ client, lessonsLeft, daysLeft, soonExpires }, i) => (
            <div key={client.id} style={row(i === endingRows.length - 1)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Avatar client={client} size={26} />
                <div style={{ minWidth: 0 }}>
                  <Link to={`/clients/${client.id}`} style={nameLink}>{client.childName}</Link>
                  {/* Причина важна: кончились деньги или кончается срок — звонят по-разному. */}
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
                    {soonExpires ? `срок ${whenLabel(daysLeft)}` : `осталось ${lessonsLabel(lessonsLeft)}`}
                  </p>
                </div>
              </div>
              <span style={{
                fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap',
                color: lessonsLeft === 0 ? '#dc2626' : '#b45309',
              }}>
                {lessonsLeft}
              </span>
            </div>
          ))}
        </div>

        {/* Дни рождения */}
        <div style={card}>
          <div style={cardTitle}>
            <Icon name="cake" size={16} style={{ color: '#db2777' }} />Дни рождения
          </div>
          {birthdayRows.length === 0 ? (
            <p style={empty}>В ближайшие две недели нет</p>
          ) : birthdayRows.map(({ client, daysLeft, turns }, i) => (
            <div key={client.id} style={row(i === birthdayRows.length - 1)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Avatar client={client} size={26} />
                <div style={{ minWidth: 0 }}>
                  <Link to={`/clients/${client.id}`} style={nameLink}>{client.childName}</Link>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
                    {whenLabel(daysLeft)}{turns ? ` · ${ageLabel(turns)}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
