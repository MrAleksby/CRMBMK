// Форма кассовой операции: пустое состояние, валидация, сборка документа.
// Вынесено из компонента, чтобы денежную логику можно было прогнать без React.

import { toAmount } from './amount'
import { KIND_INCOME, KIND_SALARY, KIND_REFUND } from './finance'

const today = () => new Date().toISOString().slice(0, 10)

export const emptyTransactionForm = (kind = KIND_INCOME) => ({
  kind,
  date: today(),
  amount: '',
  accountId: '',
  categoryId: '',
  clientId: '',
  payerName: '',
  teacherId: '',
  comment: '',
})

// Кто фактически принёс деньги. В AlfaCRM плательщик отделён от ученика:
// платит мама, занимается ребёнок. Подставляем родителя, но оставляем поле
// редактируемым — платить может кто угодно, вплоть до юрлица.
export function suggestPayer(client) {
  if (!client) return ''
  if (client.payerType === 'legal') return ''
  return client.mother?.name || client.father?.name || ''
}

// Статьи фильтруются по типу операции: в расходе не выбрать «Оплату за занятие».
export const categoriesForKind = (categories, kind) =>
  categories.filter(c => c.kind === kind && c.active !== false)

export function validateTransactionForm(form) {
  if (toAmount(form.amount) === null || toAmount(form.amount) === 0) {
    return 'Введите сумму — положительное число'
  }
  if (!form.date || Number.isNaN(new Date(form.date).getTime())) {
    return 'Укажите дату операции'
  }
  if (!form.accountId) return 'Выберите кассу'
  if (!form.categoryId) return 'Выберите статью'
  if (form.kind === KIND_SALARY && !form.teacherId) return 'Выберите педагога'
  // Возврат уменьшает предоплату конкретного ребёнка — без него операция бессмысленна.
  if (form.kind === KIND_REFUND && !form.clientId) return 'Выберите ученика, которому вернули деньги'
  return null
}

// Дата приходит из <input type="date"> без времени. Ставим полдень,
// чтобы сдвиг часового пояса не перебросил операцию на соседние сутки.
const dateAtNoon = (value) => new Date(`${value}T12:00:00`)

export function buildTransaction(form, { clients = [], teachers = [] } = {}) {
  const client = clients.find(c => c.id === form.clientId)
  const teacher = teachers.find(t => t.id === form.teacherId)

  const doc = {
    kind: form.kind,
    amount: toAmount(form.amount),
    date: dateAtNoon(form.date),
    accountId: form.accountId,
    categoryId: form.categoryId,
    comment: form.comment?.trim() || '',
  }

  // Доход может быть ничей: кешбек банка или призовой фонд турнира.
  // Возврат — всегда конкретному ребёнку, это проверяет валидация.
  if (form.kind === KIND_INCOME || form.kind === KIND_REFUND) {
    if (form.clientId) {
      doc.clientId = form.clientId
      doc.clientName = client?.childName || ''
    }
    if (form.payerName?.trim()) doc.payerName = form.payerName.trim()
  }
  if (form.kind === KIND_SALARY) {
    doc.teacherId = form.teacherId
    doc.teacherName = teacher?.name || ''
  }
  return doc
}
