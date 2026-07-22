// Абонемент — пакет уроков, выданный ученику. Не обязателен:
// многие платят поурочно, и тогда абонемента просто нет.
//
// Уроки не считаются счётчиком. Цена занятия плавает — ребёнок поел больше,
// менеджер вписал сумму выше, — поэтому «осталось уроков» выводится из денег:
// сколько ещё целых занятий покрывает баланс ученика по цене активного пакета.
// Так это устроено в AlfaCRM, и иначе счётчик уроков разъезжается с деньгами.

import { perLessonPrice } from './directories.js'
import { todayISO } from './group.js'
import { toJsDate } from './finance.js'
import { normalizeDecimal } from './amount.js'

export const SUBSCRIPTION_STATUSES = {
  active: { label: 'Активен', color: '#059669', background: '#dcfce7' },
  expired: { label: 'Истёк срок', color: '#b45309', background: '#fef3c7' },
  archived: { label: 'В архиве', color: '#6b7280', background: '#f3f4f6' },
}

// Срок действия — единственное, что делает абонемент негодным.
// Уроки «закончиться» не могут: кончаются деньги.
export function isUsable(sub, today = todayISO()) {
  if (sub.status === 'archived') return false
  if (sub.endDate && sub.endDate < today) return false
  return true
}

export function subscriptionStatus(sub, today = todayISO()) {
  if (sub.status === 'archived') return SUBSCRIPTION_STATUSES.archived
  if (sub.endDate && sub.endDate < today) return SUBSCRIPTION_STATUSES.expired
  return SUBSCRIPTION_STATUSES.active
}

export const clientSubscriptions = (subs, clientId) =>
  subs.filter(s => s.clientId === clientId)

// Действующий абонемент ученика: тот, что кончается раньше остальных.
// По его цене и считается остаток уроков.
export function activeSubscription(subs, clientId, today = todayISO()) {
  return clientSubscriptions(subs, clientId)
    .filter(s => isUsable(s, today))
    .sort((a, b) => String(a.endDate || '9999').localeCompare(String(b.endDate || '9999')))[0] || null
}

// Цена одного занятия по абонементу ученика.
export function subscriptionPerLesson(sub) {
  if (!sub) return null
  return perLessonPrice({ lessonsCount: sub.lessonsTotal, price: sub.price })
}

// Дата начисления приходит из Firestore как Timestamp, но в тестах и старых
// записях бывает строкой 'YYYY-MM-DD'. Сравнивать надо и то и другое: сортировка
// только по `seconds` молча оставляла бы занятия в исходном порядке, и долг
// в уроках считался бы не по последним занятиям.
const dateValue = (charge) => {
  const date = toJsDate(charge?.date)
  return date ? date.getTime() : 0
}

const byDateDesc = (a, b) => dateValue(b) - dateValue(a)

// Цена будущего занятия: абонемент → персональная цена ребёнка →
// последняя фактическая сумма, которую менеджер вписал в журнал.
export function expectedPrice(subs, clientId, client, clientCharges = [], today = todayISO()) {
  const byPackage = subscriptionPerLesson(activeSubscription(subs, clientId, today))
  if (byPackage) return byPackage
  if (Number.isFinite(client?.lessonPrice) && client.lessonPrice > 0) return client.lessonPrice

  const last = [...clientCharges]
    .filter(c => (c.amount || 0) > 0)
    .sort(byDateDesc)[0]
  return last?.amount || 0
}

// Долг в уроках: сколько последних проведённых занятий не покрыто деньгами.
// Именно так считает AlfaCRM — по фактическим суммам из журнала, а не по средней.
function unpaidLessons(clientCharges, debt) {
  const recent = [...clientCharges]
    .filter(c => (c.amount || 0) > 0)
    .sort(byDateDesc)

  let left = debt
  let count = 0
  for (const charge of recent) {
    if (left <= 0) break
    left -= charge.amount
    count += 1
  }
  return count
}

// Остаток ученика в уроках.
//
// Плюс — сколько занятий покрывает предоплата. Минус — за сколько проведённых
// занятий ученик ещё не заплатил. Счётчика нет: и то и другое выводится из денег,
// потому что цена занятия у каждого своя и меняется от раза к разу.
export function lessonsLeft(subs, clientId, balance = 0, clientCharges = [], client = null, today = todayISO()) {
  if (!Number.isFinite(balance) || balance === 0) return 0
  if (balance < 0) return -unpaidLessons(clientCharges, -balance)

  const price = expectedPrice(subs, clientId, client, clientCharges, today)
  return price > 0 ? Math.floor(balance / price) : 0
}

// Цена занятия: сначала абонемент, потом персональная цена ребёнка.
// Пустая строка означает «менеджер введёт вручную».
export function suggestPrice(client, subs) {
  const price = subscriptionPerLesson(activeSubscription(subs, client?.id))
  if (price !== null) return price
  return Number.isFinite(client?.lessonPrice) ? client.lessonPrice : ''
}

// Заголовок как в AlfaCRM: «Пакет 8 (2 640 000/8)» — цена пакета и число уроков.
export function subscriptionTitle(sub) {
  const price = Number(sub?.price)
  const lessons = Number(sub?.lessonsTotal)
  const name = sub?.name || 'Абонемент'
  if (!Number.isFinite(price) || !lessons) return name
  return `${name} (${price.toLocaleString('ru')}/${lessons})`
}

// Абонемент уходит из текущих, когда истёк срок или его убрали в архив.
// Именно так делит список AlfaCRM: сверху действующие, ниже «Архивные (N)».
export function splitSubscriptions(subs, today = todayISO()) {
  const current = []
  const archived = []
  for (const sub of subs) (isUsable(sub, today) ? current : archived).push(sub)

  const byStart = (a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))
  return { current: current.sort(byStart), archived: archived.sort(byStart) }
}

const MS_PER_WEEK = 7 * 86400000

// В AlfaCRM срок задают числом недель, а дата окончания подставляется сама.
// Держим оба поля синхронными: менеджеру удобнее «8 недель», проверять — по дате.
export function endDateFromWeeks(startDate, weeks) {
  const count = Number(weeks)
  if (!startDate || !Number.isFinite(count) || count <= 0) return ''
  const end = new Date(`${startDate}T12:00:00`)
  if (Number.isNaN(end.getTime())) return ''
  return new Date(end.getTime() + count * MS_PER_WEEK).toISOString().slice(0, 10)
}

export function weeksBetween(startDate, endDate) {
  if (!startDate || !endDate) return ''
  const from = new Date(`${startDate}T12:00:00`).getTime()
  const to = new Date(`${endDate}T12:00:00`).getTime()
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return ''
  return Math.round((to - from) / MS_PER_WEEK)
}

// Поля оплаты (payAmount/payAccountId/payCategoryId/payDate) нужны только при
// выдаче нового абонемента: за него сразу принимают деньги. При правке они
// не участвуют — деньги уже проведены, второй раз их заводить нельзя.
export const emptySubscriptionForm = () => ({
  packageId: '',
  startDate: todayISO(),
  endDate: '',
  weeks: '',
  note: '',
  payAmount: '',
  payAccountId: '',
  payCategoryId: '',
  payDate: todayISO(),
})

export function subscriptionToForm(sub) {
  return {
    ...emptySubscriptionForm(),
    packageId: sub.packageId || '',
    startDate: sub.startDate || todayISO(),
    endDate: sub.endDate || '',
    weeks: String(weeksBetween(sub.startDate, sub.endDate) || ''),
    note: sub.note || '',
  }
}

// withPayment — выдача нового абонемента: тогда оплата обязательна. При правке
// (false) проверяем только сам абонемент.
export function validateSubscriptionForm(form, packages, withPayment = false) {
  if (!form.packageId) return 'Выберите абонемент'
  if (!packages.some(p => p.id === form.packageId)) return 'Абонемент не найден'
  if (!form.startDate) return 'Укажите дату начала'
  if (form.endDate && form.endDate < form.startDate) return 'Дата окончания раньше начала'
  if (withPayment) {
    const amount = Number(normalizeDecimal(form.payAmount))
    if (!Number.isFinite(amount) || amount <= 0) return 'Укажите сумму оплаты'
    if (!form.payAccountId) return 'Выберите кассу'
    if (!form.payCategoryId) return 'Выберите статью дохода'
    if (!form.payDate) return 'Укажите дату оплаты'
  }
  return null
}

// Документ оплаты за абонемент. Это обычный доход: касса, статья, сумма.
// Абонемент денег не двигает, поэтому оплата — отдельная запись в transactions,
// а не поле внутри абонемента. Связь между ними только смысловая.
export function paymentFromForm(form, clientId, clientName, packageName) {
  return {
    kind: 'income',
    clientId,
    clientName: clientName || '',
    amount: Number(normalizeDecimal(form.payAmount)) || 0,
    accountId: form.payAccountId,
    categoryId: form.payCategoryId,
    comment: `Оплата за абонемент${packageName ? ` «${packageName}»` : ''}`,
    date: new Date(`${form.payDate}T12:00:00`),
  }
}

export function formToSubscriptionDoc(form, pkg, clientId) {
  return {
    clientId,
    packageId: pkg.id,
    name: pkg.name,
    // lessonsTotal и price — снимок тарифа на момент выдачи. Подорожает пакет —
    // у выданных абонементов цена занятия не поедет, и история не перепишется.
    // Счётчика использованных уроков нет: остаток выводится из денег.
    lessonsTotal: Number(pkg.lessonsCount) || 0,
    price: Number(pkg.price) || 0,
    startDate: form.startDate,
    endDate: form.endDate || '',
    note: (form.note || '').trim(),
    status: 'active',
  }
}

export function periodLabel(sub) {
  const format = (iso) => iso ? new Date(iso).toLocaleDateString('ru') : ''
  const from = format(sub.startDate)
  const to = format(sub.endDate)
  if (!from) return ''
  return to ? `${from} — ${to}` : `с ${from}`
}
