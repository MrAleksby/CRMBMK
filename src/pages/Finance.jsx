import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, addDoc, updateDoc, writeBatch, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection, invalidate } from '../lib/store'
import { MONTHS_SHORT } from '../lib/constants'
import {
  KIND_INCOME, KIND_EXPENSE, KIND_SALARY, KIND_REFUND, KIND_DRAW, KIND_TRANSFER,
  kindMeta, YEAR_ALL,
  toJsDate, inPeriod, availableYears, documentNumber, sortTransactions,
  incomeTotal, expenseTotal, salaryTotal, refundTotal, drawTotal, sumAmount,
  companyBalance, realizedProfit, accountTotals, categoryTotals,
} from '../lib/finance'
import { buildTransaction, transactionToForm } from '../lib/transaction'
import { formToSubscriptionDoc, endDateFromWeeks } from '../lib/subscription'
import { clientBalances, debtAndPrepaid } from '../lib/balance'
import { sortItems, getDirectory } from '../lib/directories'
import { normalizeDecimal } from '../lib/amount'
import { downloadCsv } from '../lib/export'
import { useSelection } from '../lib/selection'
import CategoryOptions from '../components/CategoryOptions'
import TransactionForm from '../components/TransactionForm'
import ActionToolbar from '../components/ActionToolbar'
import ErrorBanner from '../components/ErrorBanner'
import Icon from '../components/Icon'

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

// В ленте только фактическое движение денег. Начисления за проведённые занятия
// сюда не попадают: пока ученик не заплатил, денег в кассе нет — есть долг.
// Долги видны в карточке ученика и в списке клиентов.
const TABS = [
 { value: 'all', label: 'Все' },
 { value: KIND_INCOME, label: 'Доходы' },
 { value: KIND_EXPENSE, label: 'Расходы' },
 { value: KIND_SALARY, label: 'Выплаты ЗП' },
 { value: KIND_REFUND, label: 'Возвраты' },
 { value: KIND_DRAW, label: 'Изъятия' },
 { value: KIND_TRANSFER, label: 'Переводы' },
]

// Колонки таблицы — как в AlfaCRM. Каждая сортируется.
const COLUMNS = [
 { key: 'date', label: 'Дата', width: '110px' },
 { key: 'kind', label: 'Тип операции', width: '150px' },
 { key: 'amount', label: 'Сумма', width: '130px', align: 'right' },
 { key: 'account', label: 'Касса', width: '130px' },
 { key: 'category', label: 'Статья', width: '150px' },
 { key: 'client', label: 'Назначение', width: '160px' },
 { key: 'payer', label: 'Плательщик', width: '150px' },
 { key: 'comment', label: 'Комментарий' },
]

const PAGE_SIZES = [20, 50, 100]

const money = (n) => `${(n || 0).toLocaleString('ru')} сум`

// Мельче, чем на остальных экранах: в ленте операций счёт идёт на сотни строк.
const th = (align) => ({
  textAlign: align || 'left', padding: '8px 8px', fontSize: '11px',
  fontWeight: '600', color: '#4b5563', whiteSpace: 'nowrap',
  borderBottom: '1px solid #e5e7eb', cursor: 'pointer', userSelect: 'none',
})

const td = (align) => ({
  textAlign: align || 'left', padding: '8px 8px', fontSize: '12px',
  color: '#111827', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top',
})

const pageBtn = (active, disabled) => ({
  minWidth: '34px', padding: '6px 10px', borderRadius: '8px',
  border: `1px solid ${active ? '#ddd6fe' : '#e5e7eb'}`,
  background: active ? '#ede9fe' : 'transparent',
  color: active ? '#7c3aed' : '#4b5563',
  fontSize: '13px', fontWeight: active ? '600' : '400',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
})

// Первая, последняя и соседи текущей — остальное схлопывается в многоточие.
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set([1, total, current, current - 1, current + 1])
  const list = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)

  const result = []
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && list[i] - list[i - 1] > 1) result.push('…')
    result.push(list[i])
  }
  return result
}

// Суммы длинные (девять знаков), и крупные цифры съедали пол-экрана.
// Держим их компактными: карточка — сводка, а не заголовок.
function Metric({ label, value, color = '#111827', tint }) {
  return (
    <div style={{
      ...card,
      padding: '14px 16px',
      background: tint || '#ffffff',
      border: `1px solid ${tint ? 'transparent' : '#e5e7eb'}`,
    }}>
      <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '15px', fontWeight: '700', color, margin: 0 }}>{value}</p>
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
  const [packages, setPackages] = useState([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  // Статей больше, чем касс, и список уезжал далеко вниз. Показываем столько же
  // строк, сколько в соседнем блоке касс, — карточки встают вровень.
  const [showAllCategories, setShowAllCategories] = useState(false)

  // Выделение строк галочками: действия применяются к отмеченным, как в AlfaCRM.
  const selection = useSelection(transactions)

  const [filterMonth, setFilterMonth] = useState('all')
  // Год — строка: рядом с числами живёт YEAR_ALL («все годы»).
  const [filterYear, setFilterYear] = useState(() => String(new Date().getFullYear()))
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')

  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Клик по заголовку: первый раз — по убыванию, повторный — переворот.
  const toggleSort = (key) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'date' || key === 'amount' ? 'desc' : 'asc') }
    setPage(1)
  }

  const fetchAll = async (force = false) => {
    setLoadError('')
    // После своей записи читаем заново — и сбрасываем кэш целиком, иначе соседняя
    // страница (например, «Финансы») покажет ленту без только что принятой оплаты.
    if (force) invalidate()
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      // Здесь нужны все операции целиком, включая расходы и зарплаты, — это
      // касса компании. Отсюда и отдельный ключ кэша: у остальных страниц
      // в памяти лежат только оплаты и возвраты.
      const [tx, ch, acc, cat, cl, te, pk] = await Promise.all([
        readCollection('transactions', { force }),
        readCollection('charges', { force }),
        readCollection('accounts', { force }),
        readCollection('categories', { force }),
        readCollection('clients', { force }),
        readCollection('teachers', { force }),
        readCollection('packages', { force }),
      ])
      setTransactions(tx)
      setCharges(ch)
      setAccounts(sortItems(getDirectory('accounts'), acc))
      setCategories(sortItems(getDirectory('categories'), cat))
      setClients([...cl].sort((a, b) => String(a.childName || '').localeCompare(String(b.childName || ''), 'ru')))
      setTeachers(te)
      setPackages(pk)
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
      const pkg = form.subscriptionPackageId
        ? packages.find(p => p.id === form.subscriptionPackageId)
        : null

      // createdAt задаёт порядок операций одного дня: свежая — сверху.
      const now = new Date()
      if (pkg && form.clientId) {
        // Доход и назначенный абонемент — одной транзакцией: оборванная запись
        // оставила бы либо оплату без абонемента, либо абонемент без денег.
        const batch = writeBatch(db)
        batch.set(doc(collection(db, 'transactions')), { ...buildTransaction(form, { clients, teachers }), createdAt: now })
        batch.set(doc(collection(db, 'subscriptions')), {
          ...formToSubscriptionDoc(
           { packageId: pkg.id, startDate: form.date, endDate: endDateFromWeeks(form.date, form.subscriptionWeeks), note: '' },
            pkg, form.clientId,
          ),
          createdAt: now,
        })
        await batch.commit()
      } else {
        await addDoc(collection(db, 'transactions'), { ...buildTransaction(form, { clients, teachers }), createdAt: now })
      }
      setShowForm(false)
      await fetchAll(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  // Правка операции. sourceId и номер документа остаются: updateDoc меняет
  // только перечисленные поля, а привязка к AlfaCRM нужна для сверки.
  const handleUpdate = async (form) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'transactions', editing.id), buildTransaction(form, { clients, teachers }))
      setEditing(null)
      selection.clear()
      await fetchAll(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item) => {
    setShowForm(false)
    setEditing(item)
  }

  // Удаление пачкой: одной транзакцией, чтобы не оставить половину.
  const handleDeleteSelected = async () => {
    const chosen = selection.rows
    if (chosen.length === 0) return

    const total = chosen.reduce((sum, t) => sum + (t.amount || 0), 0)
    const message = chosen.length === 1
      ? 'Удалить операцию? Балансы пересчитаются.'
      : `Удалить операций: ${chosen.length} на ${total.toLocaleString('ru')} сум?\n\nБалансы пересчитаются.`
    if (!confirm(message)) return

    setSaving(true)
    try {
      const batch = writeBatch(db)
      for (const row of chosen) batch.delete(doc(db, 'transactions', row.id))
      await batch.commit()
      selection.clear()
      await fetchAll(true)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleEditSelected = () => {
    if (selection.rows.length === 1) startEdit(selection.rows[0])
  }

  const accountName = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a.name])), [accounts])
  const categoryName = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories])

  const periodTx = useMemo(
    () => transactions.filter(t => inPeriod(t, filterMonth, filterYear)),
    [transactions, filterMonth, filterYear])

  // Начисления за занятия того же периода — из них считается прибыль.
  const periodCharges = useMemo(
    () => charges.filter(c => inPeriod(c, filterMonth, filterYear)),
    [charges, filterMonth, filterYear])

  // Балансы — по всей истории: долг не «за июль», он просто есть.
  const balances = useMemo(() => clientBalances(transactions, charges), [transactions, charges])
  const { debt, prepaid } = useMemo(() => debtAndPrepaid(balances), [balances])

  const accountsReport = useMemo(() => accountTotals(transactions, accounts), [transactions, accounts])
  const categoriesReport = useMemo(() => categoryTotals(periodTx, categories), [periodTx, categories])

  // Обрезаем по числу касс: тогда обе карточки заканчиваются на одной линии,
  // а хвост статей прячется под «Показать ещё».
  const categoriesLimit = Math.max(accountsReport.length, 3)
  const visibleCategories = showAllCategories
    ? categoriesReport
    : categoriesReport.slice(0, categoriesLimit)
  // Считаем от полного списка, а не от видимого: иначе на развороте скрытых нет,
  // и кнопка «Свернуть» исчезала бы вместе со счётчиком.
  const hiddenCategories = categoriesReport.length - categoriesLimit

  const years = useMemo(() => availableYears(transactions), [transactions])

  // Таблица только по фактическим деньгам.
  const rows = useMemo(() => {
    const from = amountFrom === '' ? null : Number(normalizeDecimal(amountFrom))
    const to = amountTo === '' ? null : Number(normalizeDecimal(amountTo))
    const query = search.trim().toLowerCase()

    const matches = (t) => {
      if (filterAccount !== 'all' && t.accountId !== filterAccount) return false
      if (filterCategory !== 'all' && t.categoryId !== filterCategory) return false
      if (tab !== 'all' && t.kind !== tab) return false
      if (from !== null && (t.amount || 0) < from) return false
      if (to !== null && (t.amount || 0) > to) return false
      if (query) {
        const haystack = [t.clientName, t.payerName, t.teacherName, t.comment,
          categoryName[t.categoryId], accountName[t.accountId], documentNumber(t)]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    }

    return sortTransactions(periodTx.filter(matches), sortKey, sortDir, { accountName, categoryName })
  }, [periodTx, tab, filterAccount, filterCategory, amountFrom, amountTo, search,
      sortKey, sortDir, accountName, categoryName])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Сумма по отфильтрованному: менеджер сверяет её с выпиской.
  const rowsTotal = useMemo(
    // Перевод в итог не идёт: денег у компании не прибавилось и не убавилось.
    () => rows.reduce((sum, t) => {
      if (t.kind === KIND_TRANSFER) return sum
      return sum + (t.kind === KIND_INCOME ? 1 : -1) * (t.amount || 0)
    }, 0),
    [rows])

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  const balance = companyBalance(transactions)
  // Прибыль — по оказанным услугам, а не по деньгам в кассе: абонемент платят
  // разом, а зарабатывают его по мере занятий. Та же формула, что в «Отчётах».
  const profit = realizedProfit(periodTx, periodCharges)

  // Подпись периода: «за всё время», «2026» или «июл 2026». Метрики считаются
  // ровно по нему, поэтому подпись должна совпадать с фильтрами буквально.
  const periodLabel = filterYear === YEAR_ALL
    ? 'за всё время'
    : filterMonth === 'all'
      ? `${filterYear} год`
      : `${MONTHS_SHORT[filterMonth]} ${filterYear}`

  const exportRows = () => downloadCsv(`финансы ${periodLabel}`, [
    { label: 'Дата', value: t => toJsDate(t.date)?.toLocaleDateString('ru') || '' },
    { label: 'Документ', value: t => documentNumber(t) },
    { label: 'Тип операции', value: t => kindMeta(t.kind).label },
    // Знак ставим явно: в выгрузке иначе не отличить приход от расхода.
    { label: 'Сумма', value: t => (t.kind === KIND_INCOME ? 1 : t.kind === KIND_TRANSFER ? 0 : -1) * (t.amount || 0) },
    { label: 'Касса', value: t => accountName[t.accountId] || '' },
    { label: 'Касса-получатель', value: t => (t.kind === KIND_TRANSFER ? accountName[t.accountToId] || '' : '') },
    { label: 'Статья', value: t => categoryName[t.categoryId] || '' },
    { label: 'Ученик', value: t => t.clientName || '' },
    { label: 'Педагог', value: t => t.teacherName || '' },
    { label: 'Плательщик', value: t => t.payerName || '' },
    { label: 'Комментарий', value: t => t.comment || '' },
  ], rows)

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="finance" size={20} style={{ color: '#059669' }} />Финансы
          </h2>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
            Фактические приходы и расходы. Долги за проведённые занятия — в карточках учеников
          </p>
        </div>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchAll} />

     {editing && (
        <TransactionForm
          key={editing.id}
          accounts={accounts} categories={categories}
          clients={clients} teachers={teachers}
          saving={saving}
          initial={transactionToForm(editing)}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

     {showForm && !editing && (
        <TransactionForm
          accounts={accounts} categories={categories}
          clients={clients} teachers={teachers} packages={packages}
          saving={saving}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

     {/* Фильтры */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: '130px' }} value={filterMonth}
          onChange={e => { setFilterMonth(e.target.value); setPage(1) }}>
          <option value="all">Все месяцы</option>
         {MONTHS_SHORT.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '110px' }} value={filterYear}
          onChange={e => { setFilterYear(e.target.value); setPage(1) }}>
          <option value={YEAR_ALL}>Все годы</option>
         {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '150px' }} value={filterAccount}
          onChange={e => { setFilterAccount(e.target.value); setPage(1) }}>
          <option value="all">Все кассы</option>
         {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '170px' }} value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); setPage(1) }}>
          <option value="all">Все статьи</option>
          <CategoryOptions categories={categories} />
        </select>
        <input type="text" inputMode="decimal" placeholder="Сумма от" style={{ ...inputStyle, width: '110px' }}
          value={amountFrom} onChange={e => { setAmountFrom(e.target.value); setPage(1) }} />
        <input type="text" inputMode="decimal" placeholder="до" style={{ ...inputStyle, width: '100px' }}
          value={amountTo} onChange={e => { setAmountTo(e.target.value); setPage(1) }} />
        <input placeholder="Ученик, плательщик, комментарий" style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

     {/* Метрики */}
      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
        Показано {periodLabel}. «Баланс компании», «Долги» и «Должны клиентам» —
        всегда за всё время: долг не «за июль», он просто есть.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px', marginBottom: '24px',
      }}>
        <Metric label="Доходы" value={money(incomeTotal(periodTx))} color="#059669" />
        {/* Списано — то, что школа отработала. Прибыль считается от него, а не от
            поступлений: абонемент платят разом, а зарабатывают по мере занятий. */}
        <Metric label="Списано (занятия)" value={money(sumAmount(periodCharges))} color="#7c3aed" />
        <Metric label="Расходы компании" value={money(expenseTotal(periodTx))} color="#dc2626" />
        <Metric label="Выплаты ЗП" value={money(salaryTotal(periodTx))} color="#dc2626" />
        <Metric label="Возвраты клиентам" value={money(refundTotal(periodTx))} color="#dc2626" />
        {/* Изъятия стоят рядом с прибылью: сколько школа заработала и сколько владелец забрал. */}
        <Metric label="Изъятия владельца" value={money(drawTotal(periodTx))} color="#b45309" />
        <Metric label="Прибыль за период" value={money(profit)}
          color={profit >= 0 ? '#059669' : '#dc2626'} />
        <Metric label="Баланс компании" value={money(balance)}
          color={balance >= 0 ? '#059669' : '#dc2626'} />
        <Metric label="Долги клиентов" value={money(debt)}
          color={debt > 0 ? '#dc2626' : '#6b7280'} tint={debt > 0 ? '#fef2f2' : null} />
        <Metric label="Должны клиентам" value={money(prepaid)}
          color={prepaid > 0 ? '#059669' : '#6b7280'} tint={prepaid > 0 ? '#f0fdf4' : null} />
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
            По статьям ({periodLabel})
          </p>
         {categoriesReport.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Нет операций за период</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
             {visibleCategories.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#4b5563' }}>{c.name}</span>
                  <span style={{ color: kindMeta(c.kind).color, fontWeight: '600' }}>{money(c.total)}</span>
                </div>
              ))}

             {hiddenCategories > 0 && (
                <button onClick={() => setShowAllCategories(v => !v)} style={{
                  background: 'transparent', border: 'none', padding: '4px 0 0',
                  color: '#7c3aed', fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                }}>
                 {showAllCategories ? '▴ Свернуть' : `▾ Показать ещё ${hiddenCategories}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>


     {/* Вкладки типов операций */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#ffffff', padding: '4px', borderRadius: '12px', width: 'fit-content', flexWrap: 'wrap' }}>
       {TABS.map(t => (
          <button key={t.value} onClick={() => { setTab(t.value); setPage(1) }} style={{
            background: tab === t.value ? '#ede9fe' : 'transparent',
            color: tab === t.value ? '#7c3aed' : '#6b7280',
            border: 'none', padding: '8px 16px', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

     {/* Таблица операций. Кнопки стоят прямо над ней: действия применяются
          к отмеченным строкам, и глазами их не приходится связывать через полстраницы. */}
      <div style={card}>
        <ActionToolbar
          count={selection.count}
          busy={saving}
          onAdd={() => { setEditing(null); setShowForm(true) }}
          onEdit={handleEditSelected}
          onDelete={handleDeleteSelected}
          onClear={selection.clear}
        />

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '10px', gap: '12px', flexWrap: 'wrap', fontSize: '13px', color: '#6b7280',
        }}>
          <span>
           {rows.length === 0 ? 'Нет операций' : (
              <>Строки {(currentPage - 1) * pageSize + 1}—{Math.min(currentPage * pageSize, rows.length)} из {rows.length}
               {' · итого '}
                <b style={{ color: rowsTotal < 0 ? '#dc2626' : '#059669' }}>{money(rowsTotal)}</b>
              </>
            )}
          </span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Выгружаем то, что на экране: с фильтрами и сортировкой, но без пагинации —
                нужны все найденные строки, а не текущая страница. */}
            <button onClick={exportRows} disabled={!rows.length} style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px',
              padding: '6px 10px', color: '#4b5563', fontSize: '12px',
              cursor: rows.length ? 'pointer' : 'default', opacity: rows.length ? 1 : 0.5,
            }}>
              <Icon name="download" size={14} />Экспорт
            </button>

            <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              Строк на странице
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px' }}>
               {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>

       {rows.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '30px 0', margin: 0 }}>
            Нет операций, подходящих под фильтры
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ ...th(), width: '36px', cursor: 'default' }}>
                    <input type="checkbox" title="Отметить все строки на странице"
                      checked={selection.allVisibleChecked(pageRows)}
                      onChange={() => selection.toggleVisible(pageRows)} />
                  </th>
                 {COLUMNS.map(col => (
                    <th key={col.key} style={{ ...th(col.align), width: col.width }}
                      onClick={() => toggleSort(col.key)}
                      title="Нажмите, чтобы отсортировать">
                     {col.label}
                      <span style={{ color: sortKey === col.key ? '#7c3aed' : '#d1d5db', marginLeft: '4px' }}>
                       {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
               {pageRows.map(item => {
                  const meta = kindMeta(item.kind)
                  const isIncome = item.kind === KIND_INCOME
                  const isTransfer = item.kind === KIND_TRANSFER
                  const date = toJsDate(item.date)
                  const number = documentNumber(item)
                  const purpose = item.kind === KIND_SALARY ? item.teacherName : item.clientName
                  const checked = selection.selected.has(item.id)

                  return (
                    <tr key={item.id}
                      onDoubleClick={() => startEdit(item)}
                      title="Двойной щелчок — править операцию"
                      style={{ background: checked ? '#ede9fe' : 'transparent' }}>
                      <td style={td()}>
                        <input type="checkbox" checked={checked} onChange={() => selection.toggle(item.id)}
                          onDoubleClick={e => e.stopPropagation()} />
                      </td>
                      <td style={td()}>{date ? date.toLocaleDateString('ru') : '—'}</td>

                      <td style={td()}>
                       {/* Иконка и тип не разрываются: в узкой колонке значок
                            иначе отрывается от слова. Номер документа — строкой ниже. */}
                        <span style={{
                          color: meta.color, fontWeight: '600', whiteSpace: 'nowrap',
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                        }}>
                          <Icon name={meta.iconName} size={13} />{meta.label}
                        </span>
                       {number && (
                          <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '1px' }}>{number}</div>
                        )}
                      </td>

                      {/* Перевод не плюс и не минус: деньги остались внутри компании. */}
                      <td style={{
                        ...td('right'), fontWeight: '700', whiteSpace: 'nowrap',
                        color: isTransfer ? '#4b5563' : (isIncome ? '#059669' : '#dc2626'),
                      }}>
                       {isTransfer ? '' : (isIncome ? '+' : '−')}{money(item.amount)}
                      </td>

                      {/* У перевода касс две: показываем маршрут денег. */}
                      <td style={{ ...td(), color: '#4b5563' }}>
                       {accountName[item.accountId] || '—'}
                       {item.kind === KIND_TRANSFER && (
                          <span style={{ color: '#9ca3af' }}> → {accountName[item.accountToId] || '—'}</span>
                        )}
                      </td>
                      <td style={{ ...td(), color: '#4b5563' }}>
                       {item.kind === KIND_TRANSFER ? '—' : (categoryName[item.categoryId] || '—')}
                      </td>

                      <td style={td()}>
                       {purpose
                          ? (item.clientId
                            ? <Link to={`/clients/${item.clientId}`} style={{ color: '#7c3aed', textDecoration: 'none' }}>{purpose}</Link>
                            : purpose)
                          : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>не задано</span>}
                      </td>

                      <td style={{ ...td(), color: '#4b5563' }}>{item.payerName || '—'}</td>
                      <td style={{ ...td(), color: '#6b7280' }}>{item.comment || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

       {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={pageBtn(false, currentPage === 1)}>←</button>
           {pageNumbers(currentPage, totalPages).map((n, i) => (
              n === '…'
                ? <span key={`gap-${i}`} style={{ color: '#9ca3af', padding: '6px 4px' }}>…</span>
                : <button key={n} onClick={() => setPage(n)} style={pageBtn(n === currentPage, false)}>{n}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={pageBtn(false, currentPage === totalPages)}>→</button>
          </div>
        )}
      </div>
    </div>
  )
}
