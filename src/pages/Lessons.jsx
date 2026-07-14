import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { useAuth } from '../AuthContext'
import { canManage, teacherIdOf } from '../lib/access'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection, readClientMoney, invalidate } from '../lib/store'
import ErrorBanner from '../components/ErrorBanner'
import Icon from '../components/Icon'
import LessonJournal from '../components/LessonJournal'
import LessonForm from '../components/LessonForm'
import StudentChecklist from '../components/StudentChecklist'
import LessonCalendar from '../components/LessonCalendar'
import LessonModal from '../components/LessonModal'
import { LESSON_STATUSES, todayISO } from '../lib/group'
import { buildJournal, journalToAttendance, lessonTypeLabel, formatLessonDate, planAttendanceUpdate } from '../lib/lesson'
import { activeSubscription, lessonsLeft } from '../lib/subscription'
import { clientBalances } from '../lib/balance'
import { useIsMobile } from '../lib/useIsMobile'

const panel = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '18px',
  marginBottom: '12px',
}

const btn = (color = '#7c3aed') => ({
  background: color, color: '#fff', border: 'none', padding: '8px 16px',
  borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

const secondaryBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
}

const chip = (background, color) => ({
  fontSize: '12px', background, color, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
})

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none',
}

const TABS = [
 { value: 'upcoming', label: 'Предстоящие' },
 { value: 'planned', label: 'Запланированные' },
 { value: 'conducted', label: 'Проведённые' },
 { value: 'cancelled', label: 'Отменённые' },
]

export default function Lessons() {
  const [lessons, setLessons] = useState([])
  const [clients, setClients] = useState([])
  const [teachers, setTeachers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('upcoming')
  const [journalId, setJournalId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState('calendar')
  // На телефоне неделя не влезает: семь колонок ужимаются в нечитаемые полоски.
  // Открываем сразу день — переключиться на неделю или месяц можно вручную.
  const isMobile = useIsMobile()
  const [view, setView] = useState(() => (isMobile ? 'day' : 'week'))
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [modalId, setModalId] = useState(null)
  const [studentsId, setStudentsId] = useState(null)
  const [draftStudents, setDraftStudents] = useState([])
  const [search, setSearch] = useState('')
  const [searchParams] = useSearchParams()

  // Педагог видит только свои занятия и только смотрит: провести занятие —
  // значит списать деньги, а это работа менеджера.
  const { user, profile } = useAuth()
  const manages = canManage(user?.uid, profile)
  const myTeacherId = teacherIdOf(user?.uid, profile)

  const fetchData = async (force = false) => {
    setLoadError('')
    // После своей записи читаем заново — и сбрасываем кэш целиком, иначе соседняя
    // страница (например, «Финансы») покажет ленту без только что принятой оплаты.
    if (force) invalidate()
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())

      const [allLessons, cs, ts] = await Promise.all([
        readCollection('lessons', { force }),
        readCollection('clients', { force }),
        readCollection('teachers', { force }),
      ])
      // Чужие занятия педагогу не показываем. Если админ не привязал аккаунт
      // к строке справочника, teacherId пуст — и расписание останется пустым.
      setLessons(manages ? allLessons : allLessons.filter(l => l.teacherId === myTeacherId))
      setClients(cs)
      setTeachers(ts)

      // Педагогу деньги не отдаются — ни оплаты, ни списания, ни абонементы.
      // Запрашивать их бессмысленно: правила Firestore откажут, и страница
      // упала бы с ошибкой вместо расписания.
      if (!manages) return

      const [tx, ch, ss] = await Promise.all([
        readClientMoney({ force }),
        readCollection('charges', { force }),
        readCollection('subscriptions', { force }),
      ])
      setTransactions(tx)
      setCharges(ch)
      setSubscriptions(ss)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Переход с виджета посещений: /lessons?open=<id> сразу открывает занятие.
  useEffect(() => {
    const open = searchParams.get('open')
    if (open) setModalId(open)
  }, [searchParams])

  // Проведение: статус занятия и списания пишутся одной транзакцией.
  // У каждого присутствующего своя сумма — та, что стоит в журнале.
  const handleConduct = async (lesson, rows) => {
    setSaving(true)
    try {
      const attendance = journalToAttendance(rows)

      // Абонемент помечаем у пришедших — это след истории, по какой цене считалось
      // занятие. Счётчик уроков не трогаем: остаток выводится из денег.
      for (const record of attendance) {
        if (record.status !== 'present') continue
        const sub = activeSubscription(subscriptions, record.clientId)
        if (sub) record.subscriptionId = sub.id
      }

      const batch = writeBatch(db)
      batch.update(doc(db, 'lessons', lesson.id), { status: 'conducted', attendance })

      // Начисление создаём по сумме, а не по факту прихода: пропуск бывает платным.
      for (const record of attendance) {
        if (record.amountCharged <= 0) continue
        batch.set(doc(collection(db, 'charges')), {
          clientId: record.clientId,
          clientName: record.clientName,
          amount: record.amountCharged,
          lessons: 1,
          description: lesson.groupName || lessonTypeLabel(lesson.type),
          lessonId: lesson.id,
          date: new Date(`${lesson.date}T${lesson.timeFrom || '00:00'}`),
        })
      }

      await batch.commit()
      setJournalId(null)
      setModalId(null)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Правка журнала уже проведённого занятия: суммы иногда приходится исправлять.
  // Журнал, начисления и абонементы обновляются одной транзакцией, иначе разъедутся.
  const handleUpdateConducted = async (lesson, rows) => {
    setSaving(true)
    try {
      const plan = planAttendanceUpdate(lesson.attendance, rows, {
        charges: chargesOf(lesson.id),
        activeSubFor: clientId => activeSubscription(subscriptions, clientId)?.id || null,
      })

      const batch = writeBatch(db)
      batch.update(doc(db, 'lessons', lesson.id), { attendance: plan.attendance })

      for (const chargeId of plan.chargesToDelete) {
        batch.delete(doc(db, 'charges', chargeId))
      }
      for (const { id: chargeId, amount } of plan.chargesToUpdate) {
        batch.update(doc(db, 'charges', chargeId), { amount })
      }
      for (const charge of plan.chargesToCreate) {
        batch.set(doc(collection(db, 'charges')), {
          ...charge,
          lessons: 1,
          description: lesson.groupName || lessonTypeLabel(lesson.type),
          lessonId: lesson.id,
          date: new Date(`${lesson.date}T${lesson.timeFrom || '00:00'}`),
        })
      }

      await batch.commit()
      setJournalId(null)
      setModalId(null)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Возврат в запланированные: удаляем начисления, порождённые этим занятием.
  // Без этого долг остался бы висеть за занятие, которого не было.
  const chargesOf = (lessonId) => charges.filter(c => c.lessonId === lessonId)

  // Абонементы откат не трогает: остаток уроков считается из денег, а деньги
  // возвращаются вместе с удалением начислений.
  const rollbackCharges = (batch, lessonId) => {
    const related = chargesOf(lessonId)
    for (const charge of related) batch.delete(doc(db, 'charges', charge.id))
    return related.length
  }

  const handleReturnToPlanned = async (lesson) => {
    const related = chargesOf(lesson.id)
    const total = related.reduce((s, c) => s + (c.amount || 0), 0)
    const message = related.length
      ? `Вернуть занятие в запланированные?\n\nБудет отменено списаний: ${related.length} на ${total.toLocaleString()} сум. Деньги вернутся на баланс учеников.`
      : 'Вернуть занятие в запланированные?'
    if (!confirm(message)) return

    setSaving(true)
    try {
      const batch = writeBatch(db)
      rollbackCharges(batch, lesson.id)
      batch.update(doc(db, 'lessons', lesson.id), { status: 'planned', attendance: [] })
      await batch.commit()
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (lesson) => {
    const related = chargesOf(lesson.id)
    const message = related.length
      ? `Отменить занятие?\n\nБудет отменено списаний: ${related.length}. Деньги вернутся на баланс учеников.`
      : 'Отменить занятие?'
    if (!confirm(message)) return

    setSaving(true)
    try {
      const batch = writeBatch(db)
      rollbackCharges(batch, lesson.id)
      batch.update(doc(db, 'lessons', lesson.id), { status: 'cancelled', attendance: [] })
      await batch.commit()
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (lesson) => {
    await updateDoc(doc(db, 'lessons', lesson.id), { status: 'planned' })
    await fetchData()
  }

  const handleDelete = async (lesson) => {
    const related = chargesOf(lesson.id)
    if (related.length) {
      alert('Сначала верните занятие в запланированные — за ним стоят списания.')
      return
    }
    if (!confirm('Удалить занятие?')) return
    await deleteDoc(doc(db, 'lessons', lesson.id))
    await fetchData()
  }

  const openStudents = (lesson) => {
    setJournalId(null)
    setStudentsId(lesson.id)
    setDraftStudents(lesson.studentIds || [])
  }

  const toggleDraftStudent = (clientId) => {
    setDraftStudents(prev => prev.includes(clientId)
      ? prev.filter(s => s !== clientId)
      : [...prev, clientId])
  }

  // Состав правится только у запланированного занятия: у проведённого
  // за учениками уже стоят списания.
  const handleSaveStudents = async (lesson, ids = draftStudents) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), { studentIds: ids })
      setStudentsId(null)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async (data) => {
    setSaving(true)
    try {
      const batch = writeBatch(db)
      batch.set(doc(collection(db, 'lessons')), {
        ...data,
        groupId: null,
        groupName: '',
        status: 'planned',
        attendance: [],
        createdAt: new Date(),
      })
      await batch.commit()
      setCreating(false)
      await fetchData(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const teacherName = (id) => teachers.find(t => t.id === id)?.name || null
  const today = todayISO()

  // Баланс ученика: нужен в модалке, чтобы должники были видны красным.
  const balances = Object.fromEntries(clientBalances(transactions, charges))

  const modalLesson = lessons.find(l => l.id === modalId) || null

  // Остаток уроков по абонементам — показываем в модалке рядом с именем.
  // Остаток в уроках выводится из денег, поэтому нужны и баланс, и начисления ученика.
  const chargesBy = {}
  for (const charge of charges) (chargesBy[charge.clientId] ||= []).push(charge)

  const lessonsLeftBy = {}
  for (const client of clients) {
    lessonsLeftBy[client.id] = lessonsLeft(
      subscriptions, client.id, balances[client.id] || 0, chargesBy[client.id] || [], client)
  }

  const query = search.trim().toLowerCase()
  const filtered = lessons
    .filter(l => {
      if (query) {
        const haystack = `${l.groupName || ''} ${l.topic || ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (tab === 'upcoming') return l.status === 'planned' && l.date >= today
      if (tab === 'planned') return l.status === 'planned'
      return l.status === tab
    })
    .sort((a, b) => tab === 'conducted'
      ? b.date.localeCompare(a.date)
      : a.date.localeCompare(b.date))

  const overdue = lessons.filter(l => l.status === 'planned' && l.date < today)

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  // Шире остальных страниц: недельной сетке нужно место на семь колонок.
  return (
    <div style={{ maxWidth: '1280px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="lessons" size={20} style={{ color: '#2563eb' }} />Уроки
          </h2>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
            Журнал занятий: присутствие и списания
          </p>
        </div>
       {manages && !creating && <button onClick={() => setCreating(true)} style={btn()}>+ Разовое занятие</button>}
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

     {overdue.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px',
          padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#92400e',
        }}>
          Занятий прошло, но не проведено: <b>{overdue.length}</b>. Их даты уже позади — отметьте присутствие или отмените.
        </div>
      )}

     {creating && (
        <LessonForm
          clients={clients}
          teachers={teachers}
          saving={saving}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      <div style={{ display: 'flex', gap: '4px', background: '#ffffff', padding: '4px', borderRadius: '12px', border: '1px solid #e5e7eb', width: 'fit-content', marginBottom: '16px' }}>
       {[{ value: 'calendar', label: 'Календарь' }, { value: 'list', label: 'Список' }].map(m => (
          <button key={m.value} onClick={() => setMode(m.value)} style={{
            background: mode === m.value ? '#ede9fe' : 'transparent',
            color: mode === m.value ? '#7c3aed' : '#6b7280',
            border: 'none', padding: '8px 14px', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          }}>{m.label}</button>
        ))}
      </div>

     {mode === 'calendar' && (
        <LessonCalendar
          lessons={lessons}
          clients={clients}
          teachers={teachers}
          view={view}
          date={calendarDate}
          onViewChange={setView}
          onDateChange={setCalendarDate}
          onOpen={lesson => setModalId(lesson.id)}
          hideMoney={!manages}
        />
      )}

     {modalLesson && (
        <LessonModal
          lesson={modalLesson}
          clients={clients}
          teachers={teachers}
          balances={balances}
          lessonsLeftBy={lessonsLeftBy}
          subscriptions={subscriptions}
          saving={saving}
          onClose={() => setModalId(null)}
          onConduct={handleConduct}
          onReturn={handleReturnToPlanned}
          onCancelLesson={handleCancel}
          onSaveStudents={handleSaveStudents}
          readOnly={!manages}
        />
      )}

     {mode === 'list' && (
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', background: '#ffffff', padding: '4px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
         {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)} style={{
              background: tab === t.value ? '#ede9fe' : 'transparent',
              color: tab === t.value ? '#7c3aed' : '#6b7280',
              border: 'none', padding: '8px 14px', borderRadius: '8px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}>{t.label}</button>
          ))}
        </div>
        <input placeholder="Поиск по группе или теме" style={{ ...inputStyle, width: '240px' }}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      )}

     {mode === 'list' && (filtered.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Занятий нет</p>
        </div>
      ) : (
        filtered.map(lesson => {
          const status = LESSON_STATUSES[lesson.status] ?? LESSON_STATUSES.planned
          const isOverdue = lesson.status === 'planned' && lesson.date < today
          const teacher = teacherName(lesson.teacherId)
          const open = journalId === lesson.id
          const studentsOpen = studentsId === lesson.id
          const conductedSum = (lesson.attendance || [])
            .reduce((s, a) => s + (a.amountCharged || 0), 0)
          const presentCount = (lesson.attendance || []).filter(a => a.status === 'present').length

          return (
            <div key={lesson.id} style={{ ...panel, background: isOverdue ? '#fffbeb' : '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>
                     {formatLessonDate(lesson.date)}
                    </span>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                     {lesson.timeFrom}–{lesson.timeTo}
                    </span>
                    <span style={chip(status.background, status.color)}>{status.label}</span>
                   {isOverdue && <span style={chip('#fef3c7', '#b45309')}>Забыли провести?</span>}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                   {lesson.groupName
                      ? <span style={chip('#ede9fe', '#5b21b6')}>{lesson.groupName}</span>
                      : <span style={chip('#f3f4f6', '#4b5563')}>{lessonTypeLabel(lesson.type)}</span>}
                    <span style={chip('#f3f4f6', '#4b5563')}>{(lesson.studentIds || []).length} учеников</span>
                   {teacher && <span style={chip('#f3f4f6', '#4b5563')}>{teacher}</span>}
                   {lesson.status === 'conducted' && (
                      <span style={chip('#dcfce7', '#059669')}>
                       {presentCount} пришло · {conductedSum.toLocaleString()} сум
                      </span>
                    )}
                  </div>
                </div>

               {/* Педагог занятие не проводит и не правит: суммы списаний вводит менеджер. */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                 {manages && lesson.status === 'planned' && (
                    <>
                      <button onClick={() => setJournalId(open ? null : lesson.id)} style={btn('#059669')}>
                       {open ? 'Закрыть журнал' : 'Провести'}
                      </button>
                      <button onClick={() => studentsOpen ? setStudentsId(null) : openStudents(lesson)} style={secondaryBtn}>
                       {studentsOpen ? 'Скрыть учеников' : 'Ученики'}
                      </button>
                      <button onClick={() => handleCancel(lesson)} style={secondaryBtn}>Отменить</button>
                      <button onClick={() => handleDelete(lesson)} style={secondaryBtn}>Удалить</button>
                    </>
                  )}
                 {manages && lesson.status === 'conducted' && (
                    <>
                      <button onClick={() => setJournalId(open ? null : lesson.id)} style={secondaryBtn}>
                       {open ? 'Закрыть журнал' : 'Изменить журнал'}
                      </button>
                      <button onClick={() => handleReturnToPlanned(lesson)} disabled={saving} style={secondaryBtn}>
                        Вернуть в запланированные
                      </button>
                    </>
                  )}
                 {manages && lesson.status === 'cancelled' && (
                    <>
                      <button onClick={() => handleRestore(lesson)} style={secondaryBtn}>Восстановить</button>
                      <button onClick={() => handleDelete(lesson)} style={secondaryBtn}>Удалить</button>
                    </>
                  )}
                </div>
              </div>

             {studentsOpen && (
                <div style={{ marginTop: '14px', background: '#f7f8fa', borderRadius: '12px', padding: '14px' }}>
                  <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '10px' }}>
                    Кто занимается на этом занятии ({draftStudents.length})
                  </p>
                  <StudentChecklist clients={clients} selected={draftStudents} onToggle={toggleDraftStudent} />
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button onClick={() => handleSaveStudents(lesson)} disabled={saving}
                      style={{ ...btn(), opacity: saving ? 0.6 : 1 }}>
                     {saving ? 'Сохраняем...' : 'Сохранить состав'}
                    </button>
                    <button onClick={() => setStudentsId(null)} style={{
                      background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
                      padding: '8px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
                    }}>Отмена</button>
                  </div>
                </div>
              )}

             {open && (
                <div style={{ marginTop: '14px' }}>
                  <LessonJournal
                    rows={buildJournal(lesson, clients, subscriptions)}
                    saving={saving}
                    editing={lesson.status === 'conducted'}
                    onConduct={rows => lesson.status === 'conducted'
                      ? handleUpdateConducted(lesson, rows)
                      : handleConduct(lesson, rows)}
                    onCancel={() => setJournalId(null)}
                  />
                </div>
              )}

             {lesson.status === 'conducted' && (lesson.attendance || []).length > 0 && (
                <div style={{ marginTop: '12px', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                 {lesson.attendance.map(a => (
                    <div key={a.clientId} style={{
                      display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px',
                    }}>
                      <span style={{ color: a.status === 'present' ? '#111827' : '#9ca3af' }}>
                       {a.status === 'present' ? '✓' : '✗'} {a.clientName}
                      </span>
                      <span style={{ color: a.amountCharged > 0 ? '#dc2626' : '#9ca3af' }}>
                       {a.amountCharged > 0 ? `−${a.amountCharged.toLocaleString()} сум` : 'не списано'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      ))}
    </div>
  )
}
