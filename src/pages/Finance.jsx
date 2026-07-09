import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ErrorBanner from '../components/ErrorBanner'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
}

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

const CATEGORIES = {
  rent:     '🏢 Аренда',
  salary:   '👥 Зарплата',
  ads:      '📣 Реклама',
  supplies: '🛒 Инвентарь',
  utils:    '⚡ Коммунальные',
  other:    '📦 Прочее',
}

export default function Finance() {
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [tab, setTab] = useState('all') // 'all' | 'income' | 'expense'

  const inputStyle = {
    background: '#f7f8fa',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '8px 12px',
    color: '#111827',
    fontSize: '14px',
    outline: 'none',
  }

  const fetchAll = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [ps, es] = await withTimeout(Promise.all([
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'expenses')),
      ]))
      setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() })))
      setExpenses(es.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const filterByPeriod = (list) => list.filter(item => {
    if (filterMonth === 'all') return true
    if (!item.date?.seconds) return false
    const d = new Date(item.date.seconds * 1000)
    return d.getMonth() === parseInt(filterMonth) && d.getFullYear() === filterYear
  })

  const filteredPayments = filterByPeriod(payments)
  const filteredExpenses = filterByPeriod(expenses)

  const totalIncome = filteredPayments.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
  const totalSessions = filteredPayments.filter(p => p.type === 'session').reduce((s, p) => s + (p.amount || 0), 0)
  const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0)
  const netProfit = totalIncome - totalExpenses
  const totalSessionsCount = filteredPayments.filter(p => p.type === 'session').reduce((s, p) => s + (p.sessions || 0), 0)

  // Баланс компании — все оплаты минус все расходы за всё время
  const companyBalance = payments.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
    - expenses.reduce((s, e) => s + (e.amount || 0), 0)

  // Долги клиентов — сумма отрицательных балансов (по всем платежам, не фильтруя по периоду)
  const clientIds = [...new Set(payments.map(p => p.clientId).filter(Boolean))]
  const totalClientDebt = clientIds.reduce((sum, clientId) => {
    const ps = payments.filter(p => p.clientId === clientId)
    const income = ps.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
    const sessions = ps.filter(p => p.type === 'session').reduce((s, p) => s + (p.amount || 0), 0)
    const balance = income - sessions
    return balance < 0 ? sum + Math.abs(balance) : sum
  }, 0)

  // Должны клиентам — сумма положительных балансов (предоплаты)
  const totalOwedToClients = clientIds.reduce((sum, clientId) => {
    const ps = payments.filter(p => p.clientId === clientId)
    const income = ps.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
    const sessions = ps.filter(p => p.type === 'session').reduce((s, p) => s + (p.amount || 0), 0)
    const balance = income - sessions
    return balance > 0 ? sum + balance : sum
  }, 0)

  // Объединённая лента для вкладки "все"
  const allItems = [
    ...filteredPayments.map(p => ({ ...p, _kind: 'payment' })),
    ...filteredExpenses.map(e => ({ ...e, _kind: 'expense' })),
  ].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))

  const years = [...new Set([
    ...payments.map(p => p.date?.seconds ? new Date(p.date.seconds * 1000).getFullYear() : null),
    ...expenses.map(e => e.date?.seconds ? new Date(e.date.seconds * 1000).getFullYear() : null),
  ].filter(Boolean))]
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear())

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>💰 Финансы</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Общая сводка</p>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchAll} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <select style={{ ...inputStyle, width: '140px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="all">Все месяцы</option>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '100px' }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
          {years.sort().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={card}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Оплаты клиентов</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: '#059669', margin: 0 }}>{totalIncome.toLocaleString()} сум</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Списано (занятия)</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: '#ea580c', margin: 0 }}>{totalSessions.toLocaleString()} сум</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Расходы компании</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: '#dc2626', margin: 0 }}>{totalExpenses.toLocaleString()} сум</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Занятий</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: '#7c3aed', margin: 0 }}>{totalSessionsCount}</p>
        </div>
        <div style={{
          ...card,
          background: totalClientDebt > 0 ? '#fef2f2' : '#ffffff',
          border: `1px solid ${totalClientDebt > 0 ? '#fee2e2' : '#e5e7eb'}`,
        }}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Долги клиентов</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: totalClientDebt > 0 ? '#dc2626' : '#6b7280', margin: 0 }}>
            {totalClientDebt.toLocaleString()} сум
          </p>
        </div>
        <div style={{
          ...card,
          background: totalOwedToClients > 0 ? '#f0fdf4' : '#ffffff',
          border: `1px solid ${totalOwedToClients > 0 ? '#dcfce7' : '#e5e7eb'}`,
        }}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Должны клиентам</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: totalOwedToClients > 0 ? '#059669' : '#6b7280', margin: 0 }}>
            {totalOwedToClients.toLocaleString()} сум
          </p>
        </div>
        <div style={{
          ...card,
          background: companyBalance >= 0 ? '#0d1f2b' : '#2b0d0d',
          border: `1px solid ${companyBalance >= 0 ? '#1e3a5f' : '#fee2e2'}`,
        }}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Баланс компании</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: companyBalance >= 0 ? '#60a5fa' : '#dc2626', margin: 0 }}>
            {companyBalance.toLocaleString()} сум
          </p>
        </div>
        {(() => {
          const realized = totalSessions - totalExpenses
          return (
            <div style={{
              ...card,
              background: realized >= 0 ? '#0d1f2b' : '#2b0d0d',
              border: `1px solid ${realized >= 0 ? '#1e3a5f' : '#fee2e2'}`,
            }}>
              <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Реализованная прибыль</p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: realized >= 0 ? '#60a5fa' : '#dc2626', margin: 0 }}>
                {realized.toLocaleString()} сум
              </p>
            </div>
          )
        })()}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#ffffff', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
        {[
          { value: 'all', label: 'Все' },
          { value: 'income', label: '💰 Оплаты' },
          { value: 'expense', label: '📉 Расходы' },
        ].map(t => (
          <button key={t.value} onClick={() => setTab(t.value)} style={{
            background: tab === t.value ? '#ede9fe' : 'transparent',
            color: tab === t.value ? '#7c3aed' : '#6b7280',
            border: 'none', padding: '8px 16px', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s'
          }}>{t.label}</button>
        ))}
      </div>

      {/* Transactions */}
      {(() => {
        const items = tab === 'all' ? allItems
          : tab === 'income' ? filteredPayments.map(p => ({ ...p, _kind: 'payment' }))
          : filteredExpenses.map(e => ({ ...e, _kind: 'expense' }))

        if (items.length === 0) return (
          <div style={{ ...card, textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>Нет записей за выбранный период</p>
          </div>
        )

        return (
          <div style={card}>
            {items.map((item, i) => {
              const isIncome = item._kind === 'payment' && item.type === 'income'
              const isSession = item._kind === 'payment' && item.type === 'session'
              const isExpense = item._kind === 'expense'

              const icon = isIncome ? '💰' : isSession ? '🏃' : CATEGORIES[item.category]?.split(' ')[0] || '📦'
              const label = isIncome ? 'Оплата' : isSession ? `${item.sessions} зан.` : CATEGORIES[item.category]?.split(' ').slice(1).join(' ') || 'Расход'
              const name = isExpense ? (CATEGORIES[item.category]?.split(' ').slice(1).join(' ') || 'Расход') : item.clientName
              const amount = item.amount || 0
              const color = isIncome ? '#059669' : isSession ? '#ea580c' : '#dc2626'
              const sign = isIncome ? '+' : '-'

              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: i < items.length - 1 ? '1px solid #e5e7eb' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: isIncome ? '#dcfce7' : isSession ? '#ede9fe' : '#fee2e2',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
                    }}>{icon}</div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 }}>{name}</p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                          {item.date?.seconds ? new Date(item.date.seconds * 1000).toLocaleDateString('ru') : '—'}
                        </span>
                        <span style={{
                          fontSize: '11px', padding: '1px 7px', borderRadius: '20px',
                          background: isIncome ? '#dcfce7' : isSession ? '#ede9fe' : '#fee2e2',
                          color
                        }}>{label}</span>
                        {item.description && <span style={{ fontSize: '12px', color: '#6b7280' }}>{item.description}</span>}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: '700', color }}>{sign}{amount.toLocaleString()} сум</span>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
