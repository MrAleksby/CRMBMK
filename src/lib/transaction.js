// Форма кассовой операции: пустое состояние, валидация, сборка документа.
// Вынесено из компонента, чтобы денежную логику можно было прогнать без React.

import { toAmount } from './amount'
import { KIND_INCOME, KIND_SALARY, KIND_REFUND, KIND_TRANSFER } from './finance'

const today = () => new Date().toISOString().slice(0, 10)

export const emptyTransactionForm = (kind = KIND_INCOME) => ({
  kind,
  date: today(),
  amount: '',
  accountId: '',
  // Касса-получатель: только у перевода между кассами.
  accountToId: '',
  categoryId: '',
  clientId: '',
  payerName: '',
  teacherId: '',
  comment: '',
  // Необязательное назначение абонемента вместе с доходом. Пусто — просто оплата.
  subscriptionPackageId: '',
  subscriptionWeeks: '',
})

// Обратное преобразование: документ → поля формы, чтобы операцию можно было править.
export function transactionToForm(transaction) {
  const date = transaction.date?.toDate?.() ?? transaction.date
  const iso = date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : today()

  return {
    kind: transaction.kind,
    date: iso,
    amount: String(transaction.amount ?? ''),
    accountId: transaction.accountId || '',
    accountToId: transaction.accountToId || '',
    categoryId: transaction.categoryId || '',
    clientId: transaction.clientId || '',
    payerName: transaction.payerName || '',
    teacherId: transaction.teacherId || '',
    comment: transaction.comment || '',
    // Абонемент назначают только при создании дохода, не при правке операции.
    subscriptionPackageId: '',
    subscriptionWeeks: '',
  }
}

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
  if (!form.accountId) return form.kind === KIND_TRANSFER ? 'Выберите кассу-источник' : 'Выберите кассу'

  // У перевода статьи нет: деньги не заработаны и не потрачены, они сменили карман.
  // Зато нужна вторая касса, и она обязана отличаться от первой.
  if (form.kind === KIND_TRANSFER) {
    if (!form.accountToId) return 'Выберите кассу, куда переводите'
    if (form.accountToId === form.accountId) return 'Кассы должны быть разными'
    return null
  }

  if (!form.categoryId) return 'Выберите статью'
  // Педагог у выплаты ЗП необязателен: процент менеджера и аутсорс к нему не привязаны.
  // В истории AlfaCRM таких выплат 65 из 223.
  //
  // Возврат уменьшает предоплату конкретного ребёнка — без него операция бессмысленна.
  if (form.kind === KIND_REFUND && !form.clientId) return 'Выберите ученика, которому вернули деньги'
  return null
}

// Дата приходит из <input type="date"> без времени. Ставим полдень,
// чтобы сдвиг часового пояса не перебросил операцию на соседние сутки.
const dateAtNoon = (value) => new Date(`${value}T12:00:00`)

// Все поля перечислены всегда, даже пустые: при правке операции тип может
// смениться, и старая привязка к ученику или педагогу должна исчезнуть,
// а не остаться висеть в документе.
export function buildTransaction(form, { clients = [], teachers = [] } = {}) {
  const client = clients.find(c => c.id === form.clientId)
  const teacher = teachers.find(t => t.id === form.teacherId)

  // Доход может быть ничей: кешбек банка или призовой фонд турнира.
  // Возврат — всегда конкретному ребёнку, это проверяет валидация.
  const hasClient = (form.kind === KIND_INCOME || form.kind === KIND_REFUND) && !!form.clientId
  const isSalary = form.kind === KIND_SALARY
  const isTransfer = form.kind === KIND_TRANSFER

  return {
    kind: form.kind,
    amount: toAmount(form.amount),
    date: dateAtNoon(form.date),
    accountId: form.accountId,
    accountToId: isTransfer ? form.accountToId : '',
    categoryId: isTransfer ? '' : form.categoryId,
    comment: form.comment?.trim() || '',
    clientId: hasClient ? form.clientId : '',
    clientName: hasClient ? (client?.childName || '') : '',
    payerName: isSalary ? '' : (form.payerName?.trim() || ''),
    teacherId: isSalary ? form.teacherId : '',
    teacherName: isSalary ? (teacher?.name || '') : '',
  }
}
