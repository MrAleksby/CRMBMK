// Единственное место, где считается баланс ученика.
//
// Баланс = оплаты − возвраты − начисления за занятия.
// Плюс — предоплата, минус — долг. Ровно как в старой CRM.
//
// В расчёт идут только операции, привязанные к ученику: доход без clientId
// (кешбек банка, турнир) — деньги компании, а не платёж за ребёнка.
// Возврат средств уменьшает предоплату: деньги ушли обратно родителю.

import { KIND_INCOME, KIND_REFUND } from './finance'
import { walletKey } from './family'

const paidBy = (transactions, clientId) =>
  transactions.filter(t => t.kind === KIND_INCOME && t.clientId === clientId)

const refundedTo = (transactions, clientId) =>
  transactions.filter(t => t.kind === KIND_REFUND && t.clientId === clientId)

const chargedTo = (charges, clientId) =>
  charges.filter(c => c.clientId === clientId)

const total = (list) => list.reduce((sum, item) => sum + (item.amount || 0), 0)

export function clientBalance(transactions, charges, clientId) {
  return total(paidBy(transactions, clientId))
    - total(refundedTo(transactions, clientId))
    - total(chargedTo(charges, clientId))
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
    if (t.kind === KIND_REFUND) add(t.clientId, -(t.amount || 0))
  }
  for (const c of charges) {
    add(c.clientId, -(c.amount || 0))
  }
  return balances
}

// ── Общий кошелёк семьи ──────────────────────────────────────────────────────
//
// У детей из одной семьи деньги общие: родители покупают один пакет на двоих,
// и делить его заранее — значит гадать, кто сколько отходит. Поэтому баланс
// такого ребёнка — это баланс всей семьи, а начисления остаются у каждого свои.
//
// Отсюда главное правило отчётов: **в итогах кошелёк считается один раз**.
// Сложи балансы по детям — и деньги семьи посчитаются столько раз, сколько
// в ней детей. Ради этого все итоги ниже идут по кошелькам.

// Баланс каждого кошелька: семья одной суммой, одиночка сам по себе.
//
// Деньги, чей ученик в списке не нашёлся, не теряем, а считаем отдельным
// кошельком: иначе итог тихо разошёлся бы с лентой операций на эту сумму.
export function walletBalances(balances, clients = []) {
  const totals = new Map()
  const seen = new Set()

  for (const client of clients) {
    const key = walletKey(client)
    seen.add(client.id)
    totals.set(key, (totals.get(key) || 0) + (balances.get(client.id) || 0))
  }
  for (const [clientId, amount] of balances) {
    if (!seen.has(clientId)) totals.set(`client:${clientId}`, amount)
  }
  return totals
}

// Что показывать в строке ученика: у семейного ребёнка — деньги семьи.
// Число повторится у брата и сестры, и это правда: кошелёк один. Складывать
// такие строки глазами не нужно — итоги считает `debtAndPrepaid`.
export function effectiveBalances(balances, clients = []) {
  const byWallet = walletBalances(balances, clients)
  const result = new Map(balances)
  for (const client of clients) {
    result.set(client.id, byWallet.get(walletKey(client)) || 0)
  }
  return result
}

// Долги — сумма отрицательных балансов, взятая по модулю.
// Предоплаты — сумма положительных. Обе метрики считаются за всё время.
//
// Без списка учеников считает по детям — так было до появления семей.
// Со списком считает по кошелькам: иначе общий счёт войдёт в итог дважды.
export function debtAndPrepaid(balances, clients = null) {
  const values = clients
    ? walletBalances(balances, clients).values()
    : balances.values()

  let debt = 0
  let prepaid = 0
  for (const balance of values) {
    if (balance < 0) debt += Math.abs(balance)
    else prepaid += balance
  }
  return { debt, prepaid }
}
