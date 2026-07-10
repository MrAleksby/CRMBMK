// Абонемент — пакет уроков, выданный ученику. Не обязателен:
// многие платят поурочно, и тогда абонемента просто нет.
//
// Уроки не считаются счётчиком. Цена занятия плавает — ребёнок поел больше,
// менеджер вписал сумму выше, — поэтому «осталось уроков» выводится из денег:
// сколько ещё целых занятий покрывает баланс ученика по цене активного пакета.
// Так это устроено в AlfaCRM, и иначе счётчик уроков разъезжается с деньгами.

import { perLessonPrice } from './directories.js'
import { todayISO } from './group.js'

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

// Цена будущего занятия: абонемент → персональная цена ребёнка →
// последняя фактическая сумма, которую менеджер вписал в журнал.
export function expectedPrice(subs, clientId, client, clientCharges = [], today = todayISO()) {
  const byPackage = subscriptionPerLesson(activeSubscription(subs, clientId, today))
  if (byPackage) return byPackage
  if (Number.isFinite(client?.lessonPrice) && client.lessonPrice > 0) return client.lessonPrice

  const last = [...clientCharges]
    .filter(c => (c.amount || 0) > 0)
    .sort((a, b) => String(b.date?.seconds ?? b.date ?? '').localeCompare(String(a.date?.seconds ?? a.date ?? '')))[0]
  return last?.amount || 0
}

// Долг в уроках: сколько последних проведённых занятий не покрыто деньгами.
// Именно так считает AlfaCRM — по фактическим суммам из журнала, а не по средней.
function unpaidLessons(clientCharges, debt) {
  const recent = [...clientCharges]
    .filter(c => (c.amount || 0) > 0)
    .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))

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

export const emptySubscriptionForm = () => ({
  packageId: '',
  startDate: todayISO(),
  endDate: '',
})

export function validateSubscriptionForm(form, packages) {
  if (!form.packageId) return 'Выберите абонемент'
  if (!packages.some(p => p.id === form.packageId)) return 'Абонемент не найден'
  if (!form.startDate) return 'Укажите дату начала'
  if (form.endDate && form.endDate < form.startDate) return 'Дата окончания раньше начала'
  return null
}

export function formToSubscriptionDoc(form, pkg, clientId) {
  return {
    clientId,
    packageId: pkg.id,
    name: pkg.name,
    // lessonsTotal и price нужны, чтобы знать цену занятия. Счётчика использованных
    // уроков нет: остаток выводится из денег.
    lessonsTotal: Number(pkg.lessonsCount) || 0,
    price: Number(pkg.price) || 0,
    startDate: form.startDate,
    endDate: form.endDate || '',
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
