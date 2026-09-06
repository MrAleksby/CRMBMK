// Сверка базы: сходятся ли деньги.
//
// Считает ТЕМИ ЖЕ функциями, что и CRM (`src/lib/balance.js`, `finance.js`,
// `subscription.js`), а не повторяет формулы своими руками — иначе проверка
// сошлась бы сама с собой и ничего не доказывала.
//
// Только чтение, ничего не пишет.
//
//   npm run audit                          — живая база (нужен ключ, см. ниже)
//   npm run audit backups/2026-09-06.json  — по ночной копии
//
// Запускается через esbuild: исходники CRM импортируют друг друга без расширений
// (`from './finance'`), это резолвит Vite, а голый node — нет.
//
// Для живой базы: export GOOGLE_APPLICATION_CREDENTIALS=secrets/<ключ>.json
// Живая сверка стоит около 4000 чтений из суточных 50 000 — делать после полудня
// по Ташкенту, когда лимит только что обнулился.
//
// Снимок отстаёт: ночная копия за позавчера уже дала ложную тревогу о
// «непроведённом» занятии. На вопрос «всё ли верно сейчас» брать живую базу.

import { readFile } from 'node:fs/promises'
import { clientBalances } from '../src/lib/balance.js'
import {
  companyBalance, accountTotals, realizedProfit, incomeTotal, expenseTotal,
  salaryTotal, refundTotal, drawTotal, otherIncomeTotal, sumAmount, toJsDate,
} from '../src/lib/finance.js'
import { lessonsLeft, subscriptionPerLesson } from '../src/lib/subscription.js'

const COLLECTIONS = ['transactions', 'charges', 'clients', 'lessons', 'subscriptions',
  'accounts', 'categories', 'leads']

// Даты в дампе — { __type: 'timestamp', seconds }. Возвращаем им форму, которую
// понимает toJsDate: у Firestore это объект с полем seconds.
const revive = (value) => {
  if (Array.isArray(value)) return value.map(revive)
  if (value && typeof value === 'object') {
    if (value.__type === 'timestamp') return { seconds: value.seconds, nanoseconds: value.nanoseconds || 0 }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]))
  }
  return value
}

async function fromBackup(file) {
  const raw = JSON.parse(await readFile(file, 'utf8'))
  const src = raw.collections || raw
  const data = {}
  for (const name of COLLECTIONS) {
    data[name] = (src[name] || []).map(d => ({ id: d.id, ...revive(d.data) }))
  }
  return { data, source: `копия ${file}`, reads: 0 }
}

async function fromLive() {
  const { initializeApp, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) {
    throw new Error('Нужен ключ сервис-аккаунта:\n'
      + '  export GOOGLE_APPLICATION_CREDENTIALS=secrets/<ключ>.json\n'
      + 'Либо запустите сверку по копии: node scripts/audit.mjs backups/<дата>.json')
  }
  initializeApp({ credential: cert(JSON.parse(await readFile(keyPath, 'utf8'))) })
  const db = getFirestore()

  let reads = 0
  const data = {}
  await Promise.all(COLLECTIONS.map(async name => {
    const snap = await db.collection(name).get()
    reads += snap.size
    data[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }))
  return { data, source: `живая база, ${new Date().toLocaleString('ru-RU')}`, reads }
}

const file = process.argv[2]
const { data, source, reads } = file ? await fromBackup(file) : await fromLive()
const { transactions, charges, clients, lessons, subscriptions, accounts, categories, leads } = data

const money = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
const problems = []
const check = (ok, text) => {
  console.log(`${ok ? '  ok  ' : ' !!!  '} ${text}`)
  if (!ok) problems.push(text)
}

console.log(`\nСВЕРКА: ${source}`)
console.log(`операций ${transactions.length}, начислений ${charges.length}, учеников ${clients.length},`)
console.log(`занятий ${lessons.length}, абонементов ${subscriptions.length}, лидов ${leads.length}\n`)

// ── 1. Деньги компании ───────────────────────────────────────────────────────
console.log('1. ДЕНЬГИ КОМПАНИИ')
const balance = companyBalance(transactions)
const accountsSum = accountTotals(transactions, accounts).reduce((s, a) => s + a.total, 0)
check(Math.abs(accountsSum - balance) < 0.01,
  `сумма остатков по кассам = баланс компании: ${money(accountsSum)}`)

const income = incomeTotal(transactions)
const expense = expenseTotal(transactions)
const salary = salaryTotal(transactions)
const refund = refundTotal(transactions)
const draw = drawTotal(transactions)
check(Math.abs((income - expense - salary - refund - draw) - balance) < 0.01,
  'доходы − расходы − ЗП − возвраты − изъятия = баланс')

const charged = sumAmount(charges)
const other = otherIncomeTotal(transactions)
const profit = realizedProfit(transactions, charges)
check(Math.abs(profit - (charged + other - expense - salary)) < 0.01,
  `прибыль = списано + доходы вне занятий − расходы − ЗП: ${money(profit)}`)
console.log(`       доходы ${money(income)} · списано ${money(charged)} · вне занятий ${money(other)}`)
console.log(`       расходы ${money(expense)} · ЗП ${money(salary)} · возвраты ${money(refund)} · изъятия ${money(draw)}`)
console.log(`       баланс компании ${money(balance)}\n`)

// ── 2. Балансы учеников ──────────────────────────────────────────────────────
console.log('2. БАЛАНСЫ УЧЕНИКОВ')
const balances = clientBalances(transactions, charges)
let control = 0
for (const t of transactions) {
  if (!t.clientId) continue
  if (t.kind === 'income') control += t.amount || 0
  if (t.kind === 'refund') control -= t.amount || 0
}
for (const c of charges) if (c.clientId) control -= c.amount || 0
const balancesSum = [...balances.values()].reduce((s, v) => s + v, 0)
check(Math.abs(balancesSum - control) < 0.01,
  `сумма балансов = оплаты − возвраты − начисления: ${money(balancesSum)}`)
const debts = [...balances.values()].filter(v => v < 0)
const prepaid = [...balances.values()].filter(v => v > 0)
console.log(`       должников ${debts.length} на ${money(-debts.reduce((s, v) => s + v, 0))}`)
console.log(`       предоплат ${prepaid.length} на ${money(prepaid.reduce((s, v) => s + v, 0))}\n`)

// ── 3. Журнал занятий против начислений ──────────────────────────────────────
console.log('3. ЖУРНАЛ ↔ НАЧИСЛЕНИЯ')
const byLesson = new Map()
for (const c of charges) {
  if (!c.lessonId) continue
  if (!byLesson.has(c.lessonId)) byLesson.set(c.lessonId, [])
  byLesson.get(c.lessonId).push(c)
}
const conducted = lessons.filter(l => l.status === 'conducted')
let mismatched = 0, missing = 0, doubled = 0, splitBroken = 0
for (const lesson of conducted) {
  const rows = (lesson.attendance || []).filter(a => Number(a.amountCharged) > 0)
  const journalSum = rows.reduce((s, a) => s + Number(a.amountCharged || 0), 0)
  const own = byLesson.get(lesson.id) || []
  const chargeSum = own.reduce((s, c) => s + (c.amount || 0), 0)

  if (rows.length && !own.length) { missing++; continue }
  if (Math.abs(journalSum - chargeSum) > 0.01) {
    mismatched++
    console.log(`        ${lesson.date}: журнал ${money(journalSum)}, начислено ${money(chargeSum)}`)
  }
  const perClient = new Map()
  for (const c of own) perClient.set(c.clientId, (perClient.get(c.clientId) || 0) + 1)
  if ([...perClient.values()].some(n => n > 1)) doubled++

  // Разбивка на занятие и питание обязана складываться в итог, иначе на экране
  // одно, а на лицевом счёте другое.
  for (const a of lesson.attendance || []) {
    if (a.amountMeal === undefined) continue
    if (Math.abs((a.amountLesson || 0) + (a.amountMeal || 0) - (a.amountCharged || 0)) > 0.01) splitBroken++
  }
}
check(mismatched === 0, `суммы журнала = начисления на всех ${conducted.length} проведённых занятиях`)
check(missing === 0, `нет проведённых занятий без начислений (найдено: ${missing})`)
check(doubled === 0, `нет двойных начислений (найдено: ${doubled})`)
check(splitBroken === 0, `занятие + питание = итог во всех журналах (расхождений: ${splitBroken})`)

const lessonIds = new Set(lessons.map(l => l.id))
check(charges.filter(c => c.lessonId && !lessonIds.has(c.lessonId)).length === 0,
  'нет начислений на удалённые занятия')

const chargeSplitBroken = charges.filter(c => c.amountMeal !== undefined
  && Math.abs((c.amountLesson || 0) + (c.amountMeal || 0) - (c.amount || 0)) > 0.01)
check(chargeSplitBroken.length === 0,
  `занятие + питание = сумма во всех начислениях (расхождений: ${chargeSplitBroken.length})`)

const today = new Date().toISOString().slice(0, 10)
const hanging = lessons.filter(l => l.status !== 'conducted' && l.status !== 'cancelled'
  && l.date < today && (l.studentIds || []).length)
check(hanging.length === 0, `нет прошедших занятий с составом, но без журнала (найдено: ${hanging.length})`)
for (const l of hanging) console.log(`        ${l.date}: ${(l.studentIds || []).length} учеников, деньги не начислены`)
console.log()

// ── 4. Целостность ссылок ────────────────────────────────────────────────────
console.log('4. ЦЕЛОСТНОСТЬ ССЫЛОК')
const clientIds = new Set(clients.map(c => c.id))
const accountIds = new Set(accounts.map(a => a.id))
const categoryIds = new Set(categories.map(c => c.id))

check(transactions.filter(t => t.clientId && !clientIds.has(t.clientId)).length === 0,
  'нет операций на несуществующих учеников')
check(charges.filter(c => c.clientId && !clientIds.has(c.clientId)).length === 0,
  'нет начислений на несуществующих учеников')
check(transactions.filter(t => !t.accountId || !accountIds.has(t.accountId)).length === 0,
  'у всех операций касса из справочника')
check(transactions.filter(t => t.kind !== 'transfer')
  .filter(t => !t.categoryId || !categoryIds.has(t.categoryId)).length === 0,
  'у всех операций статья из справочника')
check(transactions.filter(t => Number(t.amount) < 0).length
  + charges.filter(c => Number(c.amount) < 0).length === 0, 'нет отрицательных сумм')
check(transactions.filter(t => !Number(t.amount)).length === 0, 'нет операций с пустой суммой')
check(transactions.filter(t => {
  const d = toJsDate(t.date)
  return d && d.toISOString().slice(0, 10) > today
}).length === 0, 'нет операций из будущего')
check(lessons.flatMap(l => (l.studentIds || []).filter(id => !clientIds.has(id))).length === 0,
  'нет «призраков» в составе занятий')
check(lessons.flatMap(l => (l.attendance || []).filter(a => a.clientId && !clientIds.has(a.clientId))).length === 0,
  'нет «призраков» в журналах')
console.log()

// ── 5. Абонементы и остаток в уроках ─────────────────────────────────────────
console.log('5. АБОНЕМЕНТЫ И ОСТАТОК В УРОКАХ')
check(subscriptions.filter(s => !Number(s.price) || !Number(s.lessonsTotal)).length === 0,
  'у всех абонементов есть цена и число уроков')
check(subscriptions.filter(s => !clientIds.has(s.clientId)).length === 0,
  'все абонементы привязаны к существующим ученикам')
check(subscriptions.filter(s => {
  const price = subscriptionPerLesson(s)
  return price !== null && !(price > 0)
}).length === 0, 'цена занятия по абонементу считается у всех')

const chargesByClient = new Map()
for (const c of charges) {
  if (!c.clientId) continue
  if (!chargesByClient.has(c.clientId)) chargesByClient.set(c.clientId, [])
  chargesByClient.get(c.clientId).push(c)
}
let signMismatch = 0
for (const client of clients) {
  const bal = balances.get(client.id) || 0
  const left = lessonsLeft(subscriptions, client.id, bal, chargesByClient.get(client.id) || [], client)
  if ((bal > 0 && left < 0) || (bal < 0 && left > 0)) signMismatch++
}
check(signMismatch === 0, `остаток в уроках не спорит со знаком баланса у всех ${clients.length} учеников`)

// ── Итог ─────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(70))
console.log(problems.length === 0
  ? 'ИТОГ: расхождений не найдено.'
  : `ИТОГ: расхождений ${problems.length}:\n` + problems.map(p => '  · ' + p).join('\n'))
if (reads) console.log(`Прочитано документов: ${reads}`)
console.log('─'.repeat(70))

process.exit(problems.length === 0 ? 0 : 1)
