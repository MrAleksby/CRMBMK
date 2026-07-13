// Финансовая модель.
//
// Две разные по природе сущности лежат в разных коллекциях:
//
//   transactions — движение реальных денег. У каждой операции есть касса
//                  и статья, поэтому отчёт по кассам сходится по построению.
//   charges      — начисление ученику за проведённое занятие. Денег не двигает,
//                  кассы не имеет: растёт долг на лицевом счёте.
//
// Смешивать их нельзя: иначе любой отчёт по кассам обязан помнить про фильтр,
// и первая же забытая проверка испортит цифры.

import { collection, query, where } from 'firebase/firestore'

export const KIND_INCOME = 'income'
export const KIND_EXPENSE = 'expense'
export const KIND_SALARY = 'salary'
export const KIND_REFUND = 'refund'

// Деньги ученика: оплаты и возвраты. Только они входят в баланс (см. balance.js),
// поэтому всем страницам, кроме «Финансов», больше ничего и не нужно.
//
// Запрашивать их отдельно — не оптимизация, а требование прав: менеджеру расходы
// и зарплаты не отдаются вовсе, и запрос всей коллекции ему просто откажут.
export const CLIENT_MONEY_KINDS = [KIND_INCOME, KIND_REFUND]

export const clientMoneyQuery = (db) =>
  query(collection(db, 'transactions'), where('kind', 'in', CLIENT_MONEY_KINDS))

// Знак операции в кассе. Начисления (charges) здесь не участвуют.
const SIGN = {
  [KIND_INCOME]: 1,
  [KIND_EXPENSE]: -1,
  [KIND_SALARY]: -1,
  [KIND_REFUND]: -1,
}

export const TX_KINDS = [
  { value: KIND_INCOME, label: 'Доход', iconName: 'money', color: '#059669' },
  { value: KIND_EXPENSE, label: 'Расход', iconName: 'download', color: '#dc2626' },
  { value: KIND_SALARY, label: 'Выплата ЗП', iconName: 'teacher', color: '#dc2626' },
  { value: KIND_REFUND, label: 'Возврат клиенту', iconName: 'undo', color: '#dc2626' },
]

export const kindMeta = (kind) => TX_KINDS.find(k => k.value === kind) ?? TX_KINDS[0]

// Firestore отдаёт Timestamp, форма — Date, бэкап — { seconds }.
// Даты в базе разного вида: у операций и начислений — Timestamp Firestore,
// у занятий — строка 'YYYY-MM-DD'. Разбираем оба, иначе сравнение дат молча
// проваливается и порядок записей остаётся случайным.
export function toJsDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000)
  if (typeof value === 'string') {
    // Полдень, а не полночь: иначе часовой пояс сдвигает дату на день назад.
    const date = new Date(`${value.slice(0, 10)}T12:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

export function inPeriod(item, month, year) {
  if (month === 'all') return true
  const date = toJsDate(item.date)
  if (!date) return false
  return date.getMonth() === Number(month) && date.getFullYear() === year
}

export const sumAmount = (list) => list.reduce((total, item) => total + (item.amount || 0), 0)

const ofKind = (transactions, kind) => transactions.filter(t => t.kind === kind)

export const incomeTotal = (transactions) => sumAmount(ofKind(transactions, KIND_INCOME))
export const expenseTotal = (transactions) => sumAmount(ofKind(transactions, KIND_EXPENSE))
export const salaryTotal = (transactions) => sumAmount(ofKind(transactions, KIND_SALARY))
export const refundTotal = (transactions) => sumAmount(ofKind(transactions, KIND_REFUND))

// Сколько денег у компании: всё пришедшее минус всё выплаченное.
// Начисления за занятия не участвуют — они не деньги, а долг ученика.
export const companyBalance = (transactions) =>
  transactions.reduce((total, t) => total + (SIGN[t.kind] ?? 0) * (t.amount || 0), 0)

// Прибыль за период — по фактическим деньгам, прошедшим через кассу.
// Проведённое, но не оплаченное занятие сюда не попадает: это долг, а не доход.
export const periodProfit = (transactions) => companyBalance(transactions)

// Остаток по каждой кассе за всё время. Порядок — как в справочнике.
export function accountTotals(transactions, accounts) {
  const totals = new Map()
  for (const t of transactions) {
    const sign = SIGN[t.kind] ?? 0
    totals.set(t.accountId, (totals.get(t.accountId) || 0) + sign * (t.amount || 0))
  }
  return accounts.map(account => ({
    ...account,
    total: totals.get(account.id) || 0,
  }))
}

// Обороты по статьям за период. Пустые статьи не показываем.
export function categoryTotals(transactions, categories) {
  const totals = new Map()
  for (const t of transactions) {
    totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + (t.amount || 0))
  }
  return categories
    .map(category => ({ ...category, total: totals.get(category.id) || 0 }))
    .filter(category => category.total > 0)
}

// Номер документа. У операций, приехавших из AlfaCRM, он сохранён в sourceId
// («pay/1475»), и менеджер узнаёт по нему платёж. У новых номера нет.
export function documentNumber(transaction) {
  const match = String(transaction.sourceId || '').match(/^pay\/(\d+)$/)
  return match ? `#${match[1]}` : ''
}

// Сортировка таблицы. Строки сравниваем по-русски, даты и суммы — как числа.
export function sortTransactions(list, key, direction, labels = {}) {
  const sign = direction === 'desc' ? -1 : 1
  const { accountName = {}, categoryName = {} } = labels

  const value = (t) => {
    switch (key) {
      case 'date': return toJsDate(t.date)?.getTime() || 0
      case 'amount': return t.amount || 0
      case 'kind': return kindMeta(t.kind).label
      case 'account': return accountName[t.accountId] || ''
      case 'category': return categoryName[t.categoryId] || ''
      case 'client': return t.clientName || ''
      case 'payer': return t.payerName || ''
      case 'comment': return t.comment || ''
      default: return 0
    }
  }

  return [...list].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    const cmp = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'ru')
    if (cmp !== 0) return sign * cmp

    // При равном ключе (обычно — операции одного дня) порядок задаёт время
    // создания: свежедобавленная встаёт выше при сортировке «сначала новые».
    // Дата операции хранится как полдень, поэтому сама по себе очерёдности
    // внутри дня не даёт. У старых записей createdAt нет — они уходят вниз дня.
    const ca = toJsDate(a.createdAt)?.getTime() || 0
    const cb = toJsDate(b.createdAt)?.getTime() || 0
    return sign * (ca - cb)
  })
}

// Годы, за которые вообще есть записи. Текущий год всегда доступен для фильтра.
export function availableYears(...lists) {
  const years = new Set()
  for (const list of lists) {
    for (const item of list) {
      const date = toJsDate(item.date)
      if (date) years.add(date.getFullYear())
    }
  }
  years.add(new Date().getFullYear())
  return [...years].sort()
}
