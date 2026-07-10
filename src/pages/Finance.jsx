import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { MONTHS_SHORT } from '../lib/constants'
import {
  TX_KINDS, KIND_INCOME, KIND_EXPENSE, KIND_SALARY, kindMeta,
  toJsDate, inPeriod, sumAmount, availableYears,
  incomeTotal, expenseTotal, salaryTotal,
  companyBalance, realizedProfit, accountTotals, categoryTotals,
} from '../lib/finance'
import { buildTransaction } from '../lib/transaction'
import { clientBalances, debtAndPrepaid } from '../lib/balance'
import { sortItems, getDirectory } from '../lib/directories'
import TransactionForm from '../components/TransactionForm'
import ErrorBanner from '../components/ErrorBanner'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
}

const inputStyle = {
  background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none',
}

// Фильтр ленты. «Занятия» — это charges, у них нет кассы и статьи.
const CHARGES = 'charges'
const TABS = [
  { value: 'all', label: 'Все' },
  { value: KIND_INCOME, label: '💰 Доходы' },
  { value: KIND_EXPENSE, label: '📉 Расходы' },
  { value: KIND_SALARY, label: '👥 Выплаты ЗП' },
  { value: CHARGES, label: '🏃 Занятия' },
]

const money = (n) => `${(n || 0).toLocaleString()} сум`

function Metric({ label, value, color = '#111827', tint }) {
  return (
    <div style={{
      ...card,
      background: tint || '#ffffff',
      border: `1px solid ${tint ? 'transparent' : '#e5e7eb'}`,
    }}>
      <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: '700', color, margin: 0 }}>{value}</p>
    </div>
  )
}

export default function Finance() {
  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [clients, setClients] = useState([])
  const [teachers, setTeachers] = useState([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [tab, setTab] = useState('all')

  const fetchAll = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [tx, ch, acc, cat, cl, te] = await withTimeout(Promise.all([
        getDocs(collection(db, 'transactions')),
        getDocs(collection(db, 'charges')),
        getDocs(collection(db, 'accounts')),
        getDocs(collection(db, 'categories')),
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'teachers')),
      ]))
      const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setTransactions(rows(tx))
      setCharges(rows(ch))
      setAccounts(sortItems(getDirectory('accounts'), rows(acc)))
      setCategories(sortItems(getDirectory('categories'), rows(cat)))
      setClients(rows(cl).sort((a, b) => String(a.childName || '').localeCompare(String(b.childName || ''), 'ru')))
      setTeachers(rows(te))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const handleCreate = async (form) => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'transactions'), buildTransaction(form, { clients, teachers }))
      setShowForm(false)
      await fetchAll()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (item._kind === CHARGES) return
    if (!confirm('Удалить операцию? Балансы пересчитаются.')) return
    try {
      await deleteDoc(doc(db, 'transactions', item.id))
      await fetchAll()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  const accountName = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts])
  const categoryName = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories])

  // Период — общий для транзакций и начислений.
  const periodTx = useMemo(
    () => transactions.filter(t => inPeriod(t, filterMonth, filterYear)),
    [transactions, filterMonth, filterYear])
  const periodCharges = useMemo(
    () => charges.filter(c => inPeriod(c, filterMonth, filterYear)),
    [charges, filterMonth, filterYear])

  // Балансы учеников считаются за всё время: долг не обнуляется сменой месяца.
  const balances = useMemo(() => clientBalances(transactions, charges), [transactions, charges])
  const { debt, prepaid } = useMemo(() => debtAndPrepaid(balances), [balances])

  const accountsReport = useMemo(() => accountTotals(transactions, accounts), [transactions, accounts])
  const categoriesReport = useMemo(() => categoryTotals(periodTx, categories), [periodTx, categories])

  const lessonsCount = useMemo(
    () => periodCharges.reduce((sum, c) => sum + (c.lessons || 0), 0), [periodCharges])

  const years = useMemo(() => availableYears(transactions, charges), [transactions, charges])

  // Лента: транзакции и начисления в одном списке, свежие сверху.
  const feed = useMemo(() => {
    const matchesFilters = (t) =>
      (filterAccount === 'all' || t.accountId === filterAccount) &&
      (filterCategory === 'all' || t.categoryId === filterCategory)

    // Начисление не имеет кассы и статьи — при таких фильтрах его показывать нечестно.
    const chargesAllowed = filterAccount === 'all' && filterCategory === 'all'

    const txItems = periodTx.filter(matchesFilters).map(t => ({ ...t, _kind: t.kind }))
    const chItems = chargesAllowed ? periodCharges.map(c => ({ ...c, _kind: CHARGES })) : []

    const items = tab === 'all' ? [...txItems, ...chItems]
      : tab === CHARGES ? chItems
      : txItems.filter(t => t.kind === tab)

    return items.sort((a, b) => (toJsDate(b.date)?.getTime() || 0) - (toJsDate(a.date)?.getTime() || 0))
  }, [periodTx, periodCharges, tab, filterAccount, filterCategory])

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  const balance = companyBalance(transactions)
  const profit = realizedProfit(periodCharges, periodTx)

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>💰 Финансы</h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Кассы, статьи и лицевые счета учеников</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          background: '#7c3aed', color: '#fff', border: 'none',
          padding: '10px 20px', borderRadius: '12px', fontSize: '14px',
          fontWeight: '600', cursor: 'pointer',
        }}>
          {showForm ? 'Закрыть' : '+ Добавить операцию'}
        </button>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchAll} />

      {showForm && (
        <TransactionForm
          accounts={accounts} categories={categories}
          clients={clients} teachers={teachers}
          saving={saving}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: '140px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="all">Все месяцы</option>
          {MONTHS_SHORT.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '100px' }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '160px' }} value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="all">Все кассы</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '180px' }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">Все статьи</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Метрики */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px', marginBottom: '24px',
      }}>
        <Metric label="Доходы" value={money(incomeTotal(periodTx))} color="#059669" />
        <Metric label="Списано (занятия)" value={money(sumAmount(periodCharges))} color="#ea580c" />
        <Metric label="Расходы компании" value={money(expenseTotal(periodTx))} color="#dc2626" />
        <Metric label="Выплаты ЗП" value={money(salaryTotal(periodTx))} color="#dc2626" />
        <Metric label="Занятий" value={lessonsCount} color="#7c3aed" />
        <Metric label="Долги клиентов" value={money(debt)}
          color={debt > 0 ? '#dc2626' : '#6b7280'} tint={debt > 0 ? '#fef2f2' : null} />
        <Metric label="Должны клиентам" value={money(prepaid)}
          color={prepaid > 0 ? '#059669' : '#6b7280'} tint={prepaid > 0 ? '#f0fdf4' : null} />
        <Metric label="Баланс компании" value={money(balance)}
          color={balance >= 0 ? '#059669' : '#dc2626'} />
        <Metric label="Реализованная прибыль" value={money(profit)}
          color={profit >= 0 ? '#059669' : '#dc2626'} />
      </div>

      {/* Кассы и статьи */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={card}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>Остатки по кассам (за всё время)</p>
          {accountsReport.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Кассы не заведены</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {accountsReport.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#4b5563' }}>{a.name}</span>
                  <span style={{ color: a.total < 0 ? '#dc2626' : '#111827', fontWeight: '600' }}>{money(a.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
            По статьям {filterMonth !== 'all' ? `(${MONTHS_SHORT[filterMonth]} ${filterYear})` : 'за всё время'}
          </p>
          {categoriesReport.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Нет операций за период</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {categoriesReport.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#4b5563' }}>{c.name}</span>
                  <span style={{ color: kindMeta(c.kind).color, fontWeight: '600' }}>{money(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Вкладки ленты */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#ffffff', padding: '4px', borderRadius: '12px', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)} style={{
            background: tab === t.value ? '#ede9fe' : 'transparent',
            color: tab === t.value ? '#7c3aed' : '#6b7280',
            border: 'none', padding: '8px 16px', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Лента */}
      {feed.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Нет записей за выбранный период</p>
        </div>
      ) : (
        <div style={card}>
          {feed.map((item, i) => {
            const isCharge = item._kind === CHARGES
            const meta = isCharge ? null : kindMeta(item.kind)

            const icon = isCharge ? '🏃' : meta.icon
            const color = isCharge ? '#ea580c' : meta.color
            const tint = isCharge ? '#ffedd5' : item.kind === KIND_INCOME ? '#dcfce7' : '#fee2e2'
            const sign = !isCharge && item.kind === KIND_INCOME ? '+' : '−'

            const title = isCharge
              ? (item.clientName || 'Ученик')
              : item.kind === KIND_SALARY ? (item.teacherName || 'Педагог')
              : (item.clientName || categoryName[item.categoryId] || meta.label)

            const label = isCharge
              ? `${item.lessons || 1} зан.`
              : categoryName[item.categoryId] || meta.label

            const date = toJsDate(item.date)
            const note = isCharge ? item.description : item.comment
            const locked = isCharge && !!item.lessonId

            return (
              <div key={`${item._kind}-${item.id}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', gap: '12px',
                borderBottom: i < feed.length - 1 ? '1px solid #e5e7eb' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: tint, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '16px',
                  }}>{icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 }}>{title}</p>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {date ? date.toLocaleDateString('ru') : '—'}
                      </span>
                      <span style={{
                        fontSize: '11px', padding: '1px 7px', borderRadius: '20px',
                        background: tint, color,
                      }}>{label}</span>
                      {!isCharge && accountName[item.accountId] && (
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>· {accountName[item.accountId]}</span>
                      )}
                      {item.payerName && (
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>· платил {item.payerName}</span>
                      )}
                      {note && <span style={{ fontSize: '12px', color: '#6b7280' }}>· {note}</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <span style={{ fontSize: '15px', fontWeight: '700', color }}>
                    {sign}{money(item.amount)}
                  </span>
                  {!isCharge && (
                    <button onClick={() => handleDelete(item)} title="Удалить операцию" style={{
                      background: 'transparent', color: '#9ca3af', border: 'none',
                      cursor: 'pointer', fontSize: '16px',
                      minWidth: '44px', minHeight: '44px',
                    }}>✕</button>
                  )}
                  {locked && (
                    <span title="Начисление за проведённое занятие. Отменить можно только через откат занятия."
                      style={{ color: '#9ca3af', fontSize: '14px', minWidth: '44px', textAlign: 'center' }}>🔒</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
