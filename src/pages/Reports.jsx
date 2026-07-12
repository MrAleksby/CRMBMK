import { useEffect, useMemo, useState } from 'react'
import { auth } from '../firebase'
import { useAuth } from '../AuthContext'
import { canSeeCompanyMoney } from '../lib/access'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection } from '../lib/store'
import ErrorBanner from '../components/ErrorBanner'
import { LEAD_STAGES } from '../lib/lead'
import { SOURCES } from '../lib/client'
import { LESSON_TYPES } from '../lib/lesson'
import { downloadCsv } from '../lib/export'
import {
  monthlyMoney, monthlyStudents, funnelReport, sourceReport,
  monthlyLessons, teacherReport, presetRange, PRESETS,
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

const select = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 8px', color: '#111827', fontSize: '12px', outline: 'none',
}

const dateInput = { ...select, padding: '6px 8px' }

const exportBtn = {
  background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 10px', color: '#4b5563', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
}

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

// Шапка отчёта: название, свои фильтры, выгрузка. Как панель над таблицей в AlfaCRM.
function ReportHead({ title, hint, children, onExport }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#111827', margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {children}
          <button onClick={onExport} style={exportBtn}>⤓ Excel</button>
        </div>
      </div>
      {hint && <p style={{ fontSize: '11px', color: '#6b7280', margin: '6px 0 0' }}>{hint}</p>}
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
  const [groups, setGroups] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Общий период — как «Фильтр» в AlfaCRM: пресет или свои даты.
  const [preset, setPreset] = useState('year')
  const [range, setRange] = useState(() => presetRange('year'))

  // Свои фильтры у каждого отчёта.
  const [moneyFilters, setMoneyFilters] = useState({ accountId: '', categoryId: '' })
  const [studentFilters, setStudentFilters] = useState({ groupId: '', teacherId: '' })
  const [funnelFilters, setFunnelFilters] = useState({ source: '' })
  const [lessonFilters, setLessonFilters] = useState({ teacherId: '', groupId: '', type: '' })

  const applyPreset = (value) => {
    setPreset(value)
    if (value !== 'custom') setRange(presetRange(value))
  }
  const setDate = (key, value) => {
    setPreset('custom')
    setRange(prev => ({ ...prev, [key]: value }))
  }

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [ch, cs, ls, lds, ts, gs] = await Promise.all([
        readCollection('charges'),
        readCollection('clients'),
        readCollection('lessons'),
        readCollection('leads'),
        readCollection('teachers'),
        readCollection('groups'),
      ])
      setCharges(ch)
      setClients(cs)
      setLessons(ls)
      setLeads(lds)
      setTeachers(ts)
      setGroups(gs)

      // Полная лента операций, кассы и статьи — это касса компании, только админ.
      if (seesMoney) {
        const [tx, acc, cat] = await Promise.all([
          readCollection('transactions'),
          readCollection('accounts'),
          readCollection('categories'),
        ])
        setTransactions(tx)
        setAccounts(acc)
        setCategories(cat)
      }
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Пустые месяцы не показываем и не выгружаем: в декабре будущего года
  // смотреть нечего, а строки с нулями только мешают читать таблицу.
  const moneyRows = useMemo(
    () => monthlyMoney(transactions, charges, range, moneyFilters)
      .filter(r => r.income || r.expense || r.salary || r.refund || r.charged),
    [transactions, charges, range, moneyFilters])

  const studentRows = useMemo(
    () => monthlyStudents(clients, lessons, transactions, range, studentFilters)
      .filter(r => r.active || r.joined || r.churned || r.paid),
    [clients, lessons, transactions, range, studentFilters])

  const lessonRows = useMemo(
    () => monthlyLessons(lessons, charges, range, lessonFilters)
      .filter(r => r.conducted || r.cancelled || r.planned || r.charged),
    [lessons, charges, range, lessonFilters])
  const teacherRows = useMemo(() => teacherReport(lessons, charges, teachers, range, { groupId: lessonFilters.groupId }), [lessons, charges, teachers, range, lessonFilters.groupId])
  const funnel = useMemo(() => funnelReport(leads, LEAD_STAGES, range, funnelFilters), [leads, range, funnelFilters])
  const sources = useMemo(() => sourceReport(leads, clients, transactions, SOURCES, range), [leads, clients, transactions, range])

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  const maxCharged = Math.max(...moneyRows.map(r => r.charged), 1)
  const maxLessons = Math.max(...lessonRows.map(r => r.conducted), 1)
  const maxRevenue = Math.max(...sources.map(s => s.revenue), 1)

  const totals = moneyRows.reduce((acc, r) => ({
    income: acc.income + r.income,
    expense: acc.expense + r.expense,
    salary: acc.salary + r.salary,
    charged: acc.charged + r.charged,
    profit: acc.profit + r.profit,
  }), { income: 0, expense: 0, salary: 0, charged: 0, profit: 0 })

  const period = `${range.from}—${range.to}`

  return (
    <div style={{ maxWidth: '1040px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0 }}>📈 Отчёты</h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          Период, фильтры и выгрузка в Excel у каждого отчёта
        </p>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {/* Общий период — как панель «Фильтр» в AlfaCRM */}
      <div style={{ ...card, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>Период</span>
        <select value={preset} onChange={e => applyPreset(e.target.value)} style={select}>
          {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          <option value="custom">Свой период</option>
        </select>
        <input type="date" value={range.from} onChange={e => setDate('from', e.target.value)} style={dateInput} />
        <span style={{ fontSize: '12px', color: '#6b7280' }}>—</span>
        <input type="date" value={range.to} onChange={e => setDate('to', e.target.value)} style={dateInput} />
      </div>

      {/* 1. Деньги по месяцам */}
      {seesMoney && (
        <div style={card}>
          <ReportHead
            title="Деньги по месяцам"
            hint="Прибыль = списано за занятия − расходы − ЗП. Не «доходы − расходы»: абонемент оплачивают разом, а зарабатывают его по мере занятий. При фильтре по кассе или статье списания не показываются — у них нет ни того, ни другого."
            onExport={() => downloadCsv(`деньги ${period}`, [
              { label: 'Месяц', value: r => r.label },
              { label: 'Оплаты', value: r => r.income },
              { label: 'Списано за занятия', value: r => r.charged },
              { label: 'Расходы', value: r => r.expense },
              { label: 'Зарплаты', value: r => r.salary },
              { label: 'Возвраты', value: r => r.refund },
              { label: 'Прибыль', value: r => r.profit },
            ], moneyRows)}
          >
            <select value={moneyFilters.accountId} style={select}
              onChange={e => setMoneyFilters(f => ({ ...f, accountId: e.target.value }))}>
              <option value="">Все кассы</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={moneyFilters.categoryId} style={select}
              onChange={e => setMoneyFilters(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">Все статьи</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </ReportHead>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '660px' }}>
              <thead>
                <tr>
                  <th style={thLeft}>Месяц</th>
                  <th style={th}>Оплаты</th>
                  <th style={th}>Списано</th>
                  <th style={th}>Расходы</th>
                  <th style={th}>ЗП</th>
                  <th style={th}>Прибыль</th>
                  <th style={{ ...th, width: '110px' }} />
                </tr>
              </thead>
              <tbody>
                {moneyRows.map(r => (
                  <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
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

      {/* 2. Ученики */}
      <div style={card}>
        <ReportHead
          title="Ученики"
          hint="Занимался — был хотя бы на одном занятии в месяце. Ушёл — ходил в прошлом месяце и не пришёл ни разу в этом. За текущий месяц отток не считается: он ещё не кончился."
          onExport={() => downloadCsv(`ученики ${period}`, [
            { label: 'Месяц', value: r => r.label },
            { label: 'Занимались', value: r => r.active },
            { label: 'Пришли', value: r => r.joined },
            { label: 'Ушли', value: r => r.churned },
            ...(seesMoney ? [
              { label: 'Оплатили', value: r => r.paid },
              { label: 'Средний чек', value: r => r.avgCheck },
            ] : []),
          ], studentRows)}
        >
          <select value={studentFilters.groupId} style={select}
            onChange={e => setStudentFilters(f => ({ ...f, groupId: e.target.value }))}>
            <option value="">Все группы</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={studentFilters.teacherId} style={select}
            onChange={e => setStudentFilters(f => ({ ...f, teacherId: e.target.value }))}>
            <option value="">Все педагоги</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </ReportHead>

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
              {studentRows.map(r => (
                <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
        <ReportHead
          title="Воронка"
          onExport={() => downloadCsv(`воронка ${period}`, [
            { label: 'Этап', value: r => r.label },
            { label: 'В работе', value: r => r.active },
            { label: 'Всего', value: r => r.count },
          ], funnel.stages)}
        >
          <select value={funnelFilters.source} style={select}
            onChange={e => setFunnelFilters({ source: e.target.value })}>
            <option value="">Все источники</option>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </ReportHead>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {funnel.stages.map(stage => (
            <div key={stage.value} style={{
              flex: '1 1 120px', background: stage.background, borderRadius: '10px', padding: '8px 10px',
            }}>
              <div style={{ fontSize: '11px', color: stage.color }}>{stage.label}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: stage.color }}>{stage.active}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#4b5563', margin: '0 0 16px' }}>
          Лидов за период: <b>{funnel.total}</b> · стали клиентами: <b style={{ color: '#059669' }}>{funnel.converted}</b>
          {' '}· отказались: <b style={{ color: '#dc2626' }}>{funnel.rejected}</b>
          {' '}· конверсия: <b style={{ color: '#7c3aed' }}>{funnel.conversion}%</b>
        </p>

        <ReportHead
          title="Источники"
          hint="Считаем не лиды, а деньги: источник, дающий сто обращений и ноль клиентов, обходится дороже, чем кажется. Выручка — оплаты за период от клиентов этого источника."
          onExport={() => downloadCsv(`источники ${period}`, [
            { label: 'Источник', value: r => r.label },
            { label: 'Лидов', value: r => r.leads },
            { label: 'Клиентов', value: r => r.clients },
            { label: 'Конверсия, %', value: r => r.conversion ?? '' },
            ...(seesMoney ? [{ label: 'Выручка', value: r => r.revenue }] : []),
          ], sources)}
        />

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
            <thead>
              <tr>
                <th style={thLeft}>Источник</th>
                <th style={th}>Лидов</th>
                <th style={th}>Клиентов</th>
                <th style={th}>Конверсия</th>
                {seesMoney && <th style={th}>Выручка</th>}
                {seesMoney && <th style={{ ...th, width: '110px' }} />}
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
        <ReportHead
          title="Занятия"
          onExport={() => downloadCsv(`занятия ${period}`, [
            { label: 'Месяц', value: r => r.label },
            { label: 'Проведено', value: r => r.conducted },
            { label: 'Запланировано', value: r => r.planned },
            { label: 'Отменено', value: r => r.cancelled },
            { label: 'Посещений', value: r => r.present },
            { label: 'Пропусков', value: r => r.absent },
            ...(seesMoney ? [{ label: 'Списано', value: r => r.charged }] : []),
          ], lessonRows)}
        >
          <select value={lessonFilters.teacherId} style={select}
            onChange={e => setLessonFilters(f => ({ ...f, teacherId: e.target.value }))}>
            <option value="">Все педагоги</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={lessonFilters.groupId} style={select}
            onChange={e => setLessonFilters(f => ({ ...f, groupId: e.target.value }))}>
            <option value="">Все группы</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={lessonFilters.type} style={select}
            onChange={e => setLessonFilters(f => ({ ...f, type: e.target.value }))}>
            <option value="">Все типы</option>
            {LESSON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </ReportHead>

        <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={thLeft}>Месяц</th>
                <th style={th}>Проведено</th>
                <th style={th}>Отменено</th>
                <th style={th}>Посещений</th>
                <th style={th}>Пропусков</th>
                {seesMoney && <th style={th}>Списано</th>}
                <th style={{ ...th, width: '110px' }} />
              </tr>
            </thead>
            <tbody>
              {lessonRows.map(r => (
                <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
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

        <ReportHead
          title="Педагоги"
          onExport={() => downloadCsv(`педагоги ${period}`, [
            { label: 'Педагог', value: r => r.name },
            { label: 'Занятий', value: r => r.lessons },
            { label: 'Посещений', value: r => r.present },
            { label: 'Пропусков', value: r => r.absent },
            ...(seesMoney ? [{ label: 'Начислено', value: r => r.earned }] : []),
          ], teacherRows)}
        />

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
            <thead>
              <tr>
                <th style={thLeft}>Педагог</th>
                <th style={th}>Занятий</th>
                <th style={th}>Посещений</th>
                <th style={th}>Пропусков</th>
                {seesMoney && <th style={th}>Начислено</th>}
              </tr>
            </thead>
            <tbody>
              {teacherRows.length === 0 && (
                <tr><td style={tdLeft} colSpan={5}>Проведённых занятий за период нет</td></tr>
              )}
              {teacherRows.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdLeft}>{t.name}</td>
                  <td style={{ ...td, fontWeight: '600' }}>{t.lessons}</td>
                  <td style={{ ...td, color: '#059669' }}>{t.present}</td>
                  <td style={{ ...td, color: t.absent ? '#b45309' : '#9ca3af' }}>{t.absent || '—'}</td>
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
