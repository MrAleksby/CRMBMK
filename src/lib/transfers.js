// Поиск старых переводов между кассами, записанных парой «расход + доход».
//
// Пока вида «Перевод» не было, деньги с расчётного счёта на карту проводили
// двумя операциями: расход с одной кассы и доход в другую. Обе попадали в отчёт,
// и доходы с расходами были завышены на суммы, которых школа не зарабатывала.
//
// Модуль чистый: он только НАХОДИТ пары, а сводит их владелец галочками.
// Автоматически сливать нельзя — одинаковая сумма в один день бывает и совпадением
// (двое детей заплатили по 300 000).

import { KIND_INCOME, KIND_EXPENSE, KIND_TRANSFER, toJsDate } from './finance'

const dayOf = (value) => {
  const date = toJsDate(value)
  return date ? date.toISOString().slice(0, 10) : null
}

// Пара — расход и доход одной суммы, в один день, по разным кассам.
// Комментарий обычно совпадает («перевод с р/с на карту 9099»), но требовать
// этого нельзя: половину записей комментировали по-разному.
export function transferPairs(transactions) {
  const expenses = transactions.filter(t => t.kind === KIND_EXPENSE)
  const incomes = transactions.filter(t => t.kind === KIND_INCOME)

  const used = new Set()
  const pairs = []

  for (const expense of expenses) {
    const day = dayOf(expense.date)
    if (!day) continue

    const income = incomes.find(i =>
      !used.has(i.id)
      && (i.amount || 0) === (expense.amount || 0)
      && dayOf(i.date) === day
      && i.accountId !== expense.accountId
      // Оплата ученика переводом быть не может: за ней стоит ребёнок.
      && !i.clientId)

    if (!income) continue
    used.add(income.id)
    pairs.push({ expense, income, day, amount: expense.amount || 0 })
  }

  return pairs.sort((a, b) => b.day.localeCompare(a.day))
}

// Что записать вместо пары: одна операция, две кассы, без статьи.
// Комментарий берём от расхода — там обычно и написано, куда переводили.
export const toTransferDoc = ({ expense, income }) => ({
  kind: KIND_TRANSFER,
  amount: expense.amount || 0,
  date: expense.date,
  accountId: expense.accountId,
  accountToId: income.accountId,
  categoryId: '',
  clientId: '',
  clientName: '',
  payerName: '',
  teacherId: '',
  teacherName: '',
  comment: expense.comment || income.comment || '',
})

export const pairsSum = (pairs) =>
  pairs.reduce((total, p) => total + (p.amount || 0), 0)
