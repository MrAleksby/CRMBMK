// Абонемент — пакет уроков, выданный ученику. Не обязателен:
// многие платят поурочно, и тогда абонемента просто нет.
import { perLessonPrice } from './directories.js'
import { todayISO } from './group.js'

export const SUBSCRIPTION_STATUSES = {
  active: { label: 'Активен', color: '#059669', background: '#dcfce7' },
  finished: { label: 'Закончился', color: '#6b7280', background: '#f3f4f6' },
  expired: { label: 'Истёк срок', color: '#b45309', background: '#fef3c7' },
}

export const remaining = (sub) =>
  Math.max((sub.lessonsTotal || 0) - (sub.lessonsUsed || 0), 0)

// Абонемент считается доступным, если уроки не кончились и срок не прошёл.
export function isUsable(sub, today = todayISO()) {
  if (sub.status === 'archived') return false
  if (remaining(sub) <= 0) return false
  if (sub.endDate && sub.endDate < today) return false
  return true
}

export function subscriptionStatus(sub, today = todayISO()) {
  if (remaining(sub) <= 0) return SUBSCRIPTION_STATUSES.finished
  if (sub.endDate && sub.endDate < today) return SUBSCRIPTION_STATUSES.expired
  return SUBSCRIPTION_STATUSES.active
}

export const clientSubscriptions = (subs, clientId) =>
  subs.filter(s => s.clientId === clientId)

// Ученик списывает уроки с того абонемента, что кончается раньше.
export function activeSubscription(subs, clientId, today = todayISO()) {
  return clientSubscriptions(subs, clientId)
    .filter(s => isUsable(s, today))
    .sort((a, b) => String(a.endDate || '9999').localeCompare(String(b.endDate || '9999')))[0] || null
}

// Остаток уроков ученика — сумма по всем действующим абонементам.
export function lessonsLeft(subs, clientId, today = todayISO()) {
  return clientSubscriptions(subs, clientId)
    .filter(s => isUsable(s, today))
    .reduce((sum, s) => sum + remaining(s), 0)
}

// Цена занятия: сначала абонемент, потом персональная цена ребёнка.
// Пустая строка означает «менеджер введёт вручную».
export function suggestPrice(client, subs) {
  const sub = activeSubscription(subs, client?.id)
  if (sub) {
    const price = perLessonPrice({ lessonsCount: sub.lessonsTotal, price: sub.price })
    if (price !== null) return price
  }
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
    lessonsTotal: Number(pkg.lessonsCount) || 0,
    lessonsUsed: 0,
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
