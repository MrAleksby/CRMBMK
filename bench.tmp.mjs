// Сколько стоит СЧЁТ, без сети и без React: те же функции, что на «Финансах».
import { readFile } from 'node:fs/promises'
import { clientBalances } from './src/lib/balance.js'
import {
  companyBalance, accountTotals, categoryTotals, realizedProfit, sortTransactions,
  incomeTotal, expenseTotal, salaryTotal, refundTotal, drawTotal, otherIncomeTotal, inPeriod,
} from './src/lib/finance.js'

const raw = JSON.parse(await readFile('../CRMBMK-backups/backups/2026-09-06.json', 'utf8')).collections
const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive)
  if (v && typeof v === 'object') {
    if (v.__type === 'timestamp') return { seconds: v.seconds, nanoseconds: v.nanoseconds || 0 }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))
  }
  return v
}
const load = (n) => (raw[n] || []).map(d => ({ id: d.id, ...revive(d.data) }))
const transactions = load('transactions'), charges = load('charges'), clients = load('clients')
const accounts = load('accounts'), categories = load('categories')
console.log(`данные: ${transactions.length} операций, ${charges.length} начислений, ${clients.length} учеников\n`)

const time = (name, fn) => {
  const t0 = performance.now()
  let r
  for (let i = 0; i < 20; i++) r = fn()
  const ms = (performance.now() - t0) / 20
  console.log(`  ${name.padEnd(38)} ${ms.toFixed(2)} мс`)
  return r
}

console.log('РАСЧЁТЫ СТРАНИЦЫ «ФИНАНСЫ» (среднее из 20 прогонов):')
const period = time('фильтр периода (весь год)', () => transactions.filter(t => inPeriod(t, '', 2026)))
time('метрики: доходы/расходы/ЗП/возвраты/изъятия', () => [
  incomeTotal(period), expenseTotal(period), salaryTotal(period),
  refundTotal(period), drawTotal(period), otherIncomeTotal(period),
])
time('баланс компании (всё время)', () => companyBalance(transactions))
time('прибыль', () => realizedProfit(period, charges))
time('остатки по кассам', () => accountTotals(transactions, accounts))
time('суммы по статьям', () => categoryTotals(period, categories))
time('балансы всех учеников', () => clientBalances(transactions, charges))
time('сортировка ленты по дате', () => sortTransactions(period, 'date', 'desc', {}))

const t0 = performance.now()
const all = () => {
  const p = transactions.filter(t => inPeriod(t, '', 2026))
  companyBalance(transactions); realizedProfit(p, charges); accountTotals(transactions, accounts)
  categoryTotals(p, categories); clientBalances(transactions, charges)
  sortTransactions(p, 'date', 'desc', {})
}
for (let i = 0; i < 20; i++) all()
console.log(`\n  ВСЁ ВМЕСТЕ, один рендер:                ${((performance.now() - t0) / 20).toFixed(2)} мс`)
