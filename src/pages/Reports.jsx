import { useEffect, useMemo, useState } from 'react'
import { auth } from '../firebase'
import { useAuth } from '../AuthContext'
import { canSeeCompanyMoney } from '../lib/access'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection } from '../lib/store'
import ErrorBanner from '../components/ErrorBanner'
import { LEAD_STAGES } from '../lib/lead'
import { SOURCES } from '../lib/client'
import {
  monthlyMoney, monthlyStudents, funnelReport, sourceReport,
  monthlyLessons, teacherReport, reportYears,
} from '../lib/reports'

const card = {
  background: '#ffffff', border: '1px solid #e5e7eb',
  borderRadius: '16px', padding: '16px 18px', marginBottom: '16px',
}

const th = {
  textAlign: 'right', padding: '7px 10px', color: '#6b7280',
  fontSize: '11px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
}
const thLeft = { ...th, textAlign: 'left' }

const td = { padding: '7px 10px', fontSize: '12px', color: '#111827', textAlign: 'right', whiteSpace: 'nowrap' }
const tdLeft = { ...td, textAlign: 'left', color: '#4b5563' }

const title = { fontSize: '13px', fontWeight: '600', color: '#111827', margin: '0 0 10px' }

const money = (n) => Math.round(n).toLocaleString('ru')

// Полоска вместо графика: библиотеку тянуть незачем, а масштаб виден сразу.
function Bar({ value, max, color }) {
  const width = max > 0 ? Math.max((Math.abs(value) / max) * 100, value ? 2 : 0) : 0
  return (
    <div style={{ background: '#f3f4f6', borderRadius: '4px', height: '6px', minWidth: '60px' }}>
      <div style={{ width: `${width}%`, background: color, height: '100%', borderRadius: '4px' }} />
    </div>
  )
}

export default function Reports() {
  const { user, profile } = useAuth()
  const seesMoney = canSeeCompanyMoney(user?.uid, profile)

  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
  const [clients, setClients] = useState([])
  const [lessons, setLessons] = useState([])
  const [leads, setLeads] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [ch, cs, ls, lds, ts] = await Promise.all([
        readCollection('charges'),
        readCollection('clients'),
        readCollection('lessons'),
        readCollection('leads'),
        readCollection('teachers'),
      ])
      setCharges(ch)
      setClients(cs)
      setLessons(ls)
      setLeads(lds)
      setTeachers(ts)

      // Полная лента операций — касса компании, её видит только админ.
      if (seesMoney) setTransactions(await readCollection('transactions'))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => reportYears(transactions, lessons), [transactions, lessons])
  const moneyRows = useMemo(() => monthlyMoney(transactions, charges, year), [transactions, charges, year])
  const studentRows = useMemo(() => monthlyStudents(clients, lessons, transactions, year), [clients, lessons, transactions, year])
  const lessonRows = useMemo(() => monthlyLessons(lessons, charges, year), [lessons, charges, year])
  const teacherRows = useMemo(() => teacherReport(lessons, charges, teachers, year), [lessons, charges, teachers, year])
  const funnel = useMemo(() => funnelReport(leads, LEAD_STAGES), [leads])
  const sources = useMemo(() => sourceReport(leads, clients, transactions, SOURCES), [leads, clients, transactions])

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  // Пустые месяцы не показываем: в январе будущего года смотреть нечего.
  const activeMoney = moneyRows.filter(r => r.income || r.expense || r.salary || r.charged)
  const activeLessons = lessonRows.filter(r => r.conducted || r.cancelled)
  const activeStudents = studentRows.filter(r => r.active || r.joined || r.paid)

  const maxCharged = Math.max(...moneyRows.map(r => r.charged), 1)
  const maxLessons = Math.max(...lessonRows.map(r => r.conducted), 1)
  const maxRevenue = Math.max(...sources.map(s => s.revenue), 1)

  const totals = activeMoney.reduce((acc, r) => ({
    income: acc.income + r.income,
    expense: acc.expense + r.expense,
    salary: acc.salary + r.salary,
    charged: acc.charged + r.charged,
    profit: acc.profit + r.profit,
  }), { income: 0, expense: 0, salary: 0, charged: 0, profit: 0 })

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0 }}>📈 Отчёты</h2>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
            Деньги, ученики, воронка и занятия за год
          </p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{
          background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
          padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none',
        }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {/* 1. Деньги по месяцам */}
      {seesMoney && (
        <div style={card}>
          <h3 style={title}>Деньги по месяцам</h3>
          <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 10px' }}>
            Прибыль = списано за занятия − расходы − ЗП. Не «доходы − расходы»: абонемент
            оплачивают разом, а зарабатывают его по мере занятий.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
              <thead>
                <tr>
                  <th style={thLeft}>Месяц</th>
                  <th style={th}>Оплаты</th>
                  <th style={th}>Списано</th>
                  <th style={th}>Расходы</th>
                  <th style={th}>ЗП</th>
                  <th style={th}>Прибыль</th>
                  <th style={{ ...th, width: '120px' }} />
                </tr>
              </thead>
              <tbody>
                {activeMoney.map(r => (
                  <tr key={r.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdLeft}>{r.label}</td>
                    <td style={{ ...td, color: '#059669' }}>{money(r.income)}</td>
                    <td style={td}>{money(r.charged)}</td>
                    <td style={{ ...td, color: '#dc2626' }}>{money(r.expense)}</td>
                    <td style={{ ...td, color: '#dc2626' }}>{money(r.salary)}</td>
                    <td style={{ ...td, fontWeight: '700', color: r.profit < 0 ? '#dc2626' : '#059669' }}>
                      {money(r.profit)}
                    </td>
                    <td style={td}><Bar value={r.charged} max={maxCharged} color="#7c3aed" /></td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...tdLeft, fontWeight: '700', color: '#111827' }}>Итого</td>
                  <td style={{ ...td, fontWeight: '700', color: '#059669' }}>{money(totals.income)}</td>
                  <td style={{ ...td, fontWeight: '700' }}>{money(totals.charged)}</td>
                  <td style={{ ...td, fontWeight: '700', color: '#dc2626' }}>{money(totals.expense)}</td>
                  <td style={{ ...td, fontWeight: '700', color: '#dc2626' }}>{money(totals.salary)}</td>
                  <td style={{ ...td, fontWeight: '700', color: totals.profit < 0 ? '#dc2626' : '#059669' }}>
                    {money(totals.profit)}
                  </td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Ученики и отток */}
      <div style={card}>
        <h3 style={title}>Ученики</h3>
        <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 10px' }}>
          Активный — тот, кто был хотя бы на одном занятии в этом месяце. Ушедший — ходил
          в прошлом месяце и не пришёл ни разу в этом. За текущий месяц отток не считается:
          он ещё не кончился.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
            <thead>
              <tr>
                <th style={thLeft}>Месяц</th>
                <th style={th}>Занимались</th>
                <th style={th}>Пришли</th>
                <th style={th}>Ушли</th>
                {seesMoney && <th style={th}>Оплатили</th>}
                {seesMoney && <th style={th}>Средний чек</th>}
              </tr>
            </thead>
            <tbody>
              {activeStudents.map(r => (
                <tr key={r.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdLeft}>{r.label}</td>
                  <td style={{ ...td, fontWeight: '600' }}>{r.active}</td>
                  <td style={{ ...td, color: '#059669' }}>{r.joined ? `+${r.joined}` : '—'}</td>
                  <td style={{ ...td, color: r.churned ? '#dc2626' : '#9ca3af' }}>
                    {r.churned ? `−${r.churned}` : '—'}
                  </td>
                  {seesMoney && <td style={td}>{money(r.paid)}</td>}
                  {seesMoney && <td style={td}>{money(r.avgCheck)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Воронка и источники */}
      <div style={card}>
        <h3 style={title}>Воронка</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {funnel.stages.map(stage => (
            <div key={stage.value} style={{
              flex: '1 1 120px', background: stage.background, borderRadius: '10px', padding: '8px 10px',
            }}>
              <div style={{ fontSize: '11px', color: stage.color }}>{stage.label}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: stage.color }}>{stage.active}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#4b5563', margin: '0 0 14px' }}>
          Всего лидов: <b>{funnel.total}</b> · стали клиентами: <b style={{ color: '#059669' }}>{funnel.converted}</b>
          {' '}· отказались: <b style={{ color: '#dc2626' }}>{funnel.rejected}</b>
          {' '}· конверсия: <b style={{ color: '#7c3aed' }}>{funnel.conversion}%</b>
        </p>

        <h3 style={title}>Источники</h3>
        <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 10px' }}>
          Считаем не лиды, а деньги: источник, дающий сто обращений и ноль клиентов,
          обходится дороже, чем кажется.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
            <thead>
              <tr>
                <th style={thLeft}>Источник</th>
                <th style={th}>Лидов</th>
                <th style={th}>Клиентов</th>
                <th style={th}>Конверсия</th>
                {seesMoney && <th style={th}>Выручка</th>}
                {seesMoney && <th style={{ ...th, width: '120px' }} />}
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.value} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdLeft}>{s.icon} {s.label}</td>
                  <td style={td}>{s.leads || '—'}</td>
                  <td style={{ ...td, fontWeight: '600' }}>{s.clients || '—'}</td>
                  <td style={td}>{s.conversion === null ? '—' : `${s.conversion}%`}</td>
                  {seesMoney && <td style={{ ...td, color: '#059669', fontWeight: '600' }}>{money(s.revenue)}</td>}
                  {seesMoney && <td style={td}><Bar value={s.revenue} max={maxRevenue} color="#059669" /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Занятия и педагоги */}
      <div style={card}>
        <h3 style={title}>Занятия</h3>
        <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
            <thead>
              <tr>
                <th style={thLeft}>Месяц</th>
                <th style={th}>Проведено</th>
                <th style={th}>Отменено</th>
                <th style={th}>Посещений</th>
                <th style={th}>Пропусков</th>
                {seesMoney && <th style={th}>Списано</th>}
                <th style={{ ...th, width: '120px' }} />
              </tr>
            </thead>
            <tbody>
              {activeLessons.map(r => (
                <tr key={r.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdLeft}>{r.label}</td>
                  <td style={{ ...td, fontWeight: '600' }}>{r.conducted}</td>
                  <td style={{ ...td, color: r.cancelled ? '#b45309' : '#9ca3af' }}>{r.cancelled || '—'}</td>
                  <td style={{ ...td, color: '#059669' }}>{r.present}</td>
                  <td style={{ ...td, color: r.absent ? '#b45309' : '#9ca3af' }}>{r.absent || '—'}</td>
                  {seesMoney && <td style={td}>{money(r.charged)}</td>}
                  <td style={td}><Bar value={r.conducted} max={maxLessons} color="#7c3aed" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={title}>Педагоги</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
            <thead>
              <tr>
                <th style={thLeft}>Педагог</th>
                <th style={th}>Занятий</th>
                <th style={th}>Посещений</th>
                {seesMoney && <th style={th}>Начислено</th>}
              </tr>
            </thead>
            <tbody>
              {teacherRows.length === 0 && (
                <tr><td style={tdLeft} colSpan={4}>Проведённых занятий за год нет</td></tr>
              )}
              {teacherRows.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdLeft}>{t.name}</td>
                  <td style={{ ...td, fontWeight: '600' }}>{t.lessons}</td>
                  <td style={td}>{t.present}</td>
                  {seesMoney && <td style={{ ...td, color: '#059669' }}>{money(t.earned)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
