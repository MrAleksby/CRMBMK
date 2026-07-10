// Единственное место, где считается баланс ученика.
//
// Баланс = оплаты минус начисления за занятия.
// Плюс — предоплата, минус — долг. Ровно как в старой CRM.
//
// В расчёт идут только доходные операции, привязанные к ученику: доход без
// clientId (кешбек банка, турнир) — деньги компании, а не платёж за ребёнка.

import { KIND_INCOME } from './finance'

const paidBy = (transactions, clientId) =>
  transactions.filter(t => t.kind === KIND_INCOME && t.clientId === clientId)

const chargedTo = (charges, clientId) =>
  charges.filter(c => c.clientId === clientId)

const total = (list) => list.reduce((sum, item) => sum + (item.amount || 0), 0)

export function clientBalance(transactions, charges, clientId) {
  return total(paidBy(transactions, clientId)) - total(chargedTo(charges, clientId))
}

// Балансы всех учеников за один проход. Списки большие, а страницы
// раньше считали баланс в цикле по клиентам — получалось O(n²).
export function clientBalances(transactions, charges) {
  const balances = new Map()
  const add = (clientId, delta) => {
    if (!clientId) return
    balances.set(clientId, (balances.get(clientId) || 0) + delta)
  }

  for (const t of transactions) {
    if (t.kind === KIND_INCOME) add(t.clientId, t.amount || 0)
  }
  for (const c of charges) {
    add(c.clientId, -(c.amount || 0))
  }
  return balances
}

// Долги — сумма отрицательных балансов, взятая по модулю.
// Предоплаты — сумма положительных. Обе метрики считаются за всё время.
export function debtAndPrepaid(balances) {
  let debt = 0
  let prepaid = 0
  for (const balance of balances.values()) {
    if (balance < 0) debt += Math.abs(balance)
    else prepaid += balance
  }
  return { debt, prepaid }
}
