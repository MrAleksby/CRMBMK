// Дашборд отвечает на один вопрос: «что делать сегодня». Поэтому здесь нет
// итогов за всё время — они живут в «Отчётах». Здесь только то, на что менеджер
// реагирует сегодня: чьи занятия ведём, кто должен денег, у кого кончается
// абонемент и кого поздравить.
//
// Модуль чистый (Firestore не знает) — как и остальная считающая логика, чтобы
// его можно было проверить тестами.

import { todayISO, LESSON_STATUSES } from './group.js'
import { lessonsLeft, activeSubscription, clientSubscriptions } from './subscription.js'
import { isLeadClient } from './client.js'

// Занятия выбранного дня, по времени начала. Отменённые не показываем:
// делать по ним сегодня нечего.
export function lessonsOfDay(lessons, today = todayISO()) {
  return lessons
    .filter(l => l.date === today && l.status !== 'cancelled')
    .sort((a, b) => String(a.timeFrom || '').localeCompare(String(b.timeFrom || '')))
}

export const lessonStatusInfo = (lesson) =>
  LESSON_STATUSES[lesson?.status] || LESSON_STATUSES.planned

// Должники: баланс минусовой — значит за проведённые занятия не заплачено.
// Лиды сюда не попадают, у них истории нет.
export function debtors(clients, balances, limit = 6) {
  return clients
    .filter(c => !isLeadClient(c) && (balances.get(c.id) || 0) < 0)
    .map(c => ({ client: c, balance: balances.get(c.id) || 0 }))
    .sort((a, b) => a.balance - b.balance)
    .slice(0, limit)
}

// Абонемент «кончается» по двум разным причинам, и путать их нельзя:
// деньги на исходе (остаток в уроках мал) либо истекает срок.
// Обе — повод позвонить родителю, поэтому список один, но с пометкой причины.
export function endingSubscriptions(clients, subscriptions, balances, charges, {
  today = todayISO(),
  lessonsThreshold = 2,
  daysThreshold = 7,
  limit = 6,
} = {}) {
  const rows = []

  for (const client of clients) {
    if (isLeadClient(client)) continue

    const subs = clientSubscriptions(subscriptions, client.id)
    const active = activeSubscription(subs, client.id, today)
    if (!active) continue

    const balance = balances.get(client.id) || 0
    // Долг — это отдельная карточка «Должники»; здесь только те, кто ещё в плюсе.
    if (balance < 0) continue

    const clientCharges = charges.filter(ch => ch.clientId === client.id)
    const left = lessonsLeft(subs, client.id, balance, clientCharges, client, today)
    const days = daysUntil(active.endDate, today)

    const lowLessons = left <= lessonsThreshold
    const soonExpires = days !== null && days <= daysThreshold

    if (!lowLessons && !soonExpires) continue

    rows.push({ client, subscription: active, lessonsLeft: left, daysLeft: days, lowLessons, soonExpires })
  }

  // Сначала у кого меньше уроков, при равенстве — у кого раньше истекает срок.
  rows.sort((a, b) =>
    a.lessonsLeft - b.lessonsLeft ||
    (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))

  return rows.slice(0, limit)
}

// Полных дней от сегодня до даты 'YYYY-MM-DD'. Без срока — null: бессрочный
// абонемент не «истекает», и подгонять его под ноль нельзя.
export function daysUntil(iso, today = todayISO()) {
  if (!iso) return null
  const to = Date.parse(`${iso}T00:00:00Z`)
  const from = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(to) || Number.isNaN(from)) return null
  return Math.round((to - from) / 86400000)
}

// Дни рождения ближайших двух недель. Год в дате рождения свой у каждого,
// поэтому сравниваем только месяц и день — и через новый год список не рвётся.
export function upcomingBirthdays(clients, { today = todayISO(), days = 14, limit = 6 } = {}) {
  const rows = []

  for (const client of clients) {
    if (isLeadClient(client) || !client.birthDate) continue
    const inDays = daysUntilBirthday(client.birthDate, today)
    if (inDays === null || inDays > days) continue
    rows.push({ client, daysLeft: inDays, turns: turningAge(client.birthDate, today, inDays) })
  }

  return rows.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, limit)
}

export function daysUntilBirthday(birthDate, today = todayISO()) {
  const [, bm, bd] = String(birthDate).split('-').map(Number)
  if (!bm || !bd) return null
  const [ty] = today.split('-').map(Number)

  const from = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(from)) return null

  // 29 февраля в невисокосный год Date переносит на 1 марта — так и поздравим.
  for (const year of [ty, ty + 1]) {
    const next = Date.UTC(year, bm - 1, bd)
    if (next >= from) return Math.round((next - from) / 86400000)
  }
  return null
}

// Сколько исполнится в этот день рождения — именно на дату праздника,
// а не сегодня: «завтра будет 9» точнее, чем «сейчас 8».
function turningAge(birthDate, today, inDays) {
  const [by] = String(birthDate).split('-').map(Number)
  if (!by) return null
  const target = new Date(Date.parse(`${today}T00:00:00Z`) + inDays * 86400000)
  const age = target.getUTCFullYear() - by
  return age > 0 && age < 120 ? age : null
}
