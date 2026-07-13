// Дашборд отвечает на один вопрос: «что делать сегодня». Поэтому здесь нет
// итогов за всё время — они живут в «Отчётах». Здесь только то, на что менеджер
// реагирует сегодня: чьи занятия ведём, кто должен денег, у кого кончается
// абонемент и кого поздравить.
//
// Модуль чистый (Firestore не знает) — как и остальная считающая логика, чтобы
// его можно было проверить тестами.

import { todayISO, toISO, LESSON_STATUSES } from './group.js'
import { lessonsLeft, clientSubscriptions } from './subscription.js'
import { isLeadClient } from './client.js'
import { KIND_INCOME, toJsDate } from './finance.js'

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

// Кто заплатил вперёд. Рядом с суммой — на сколько занятий её хватит: остаток
// в уроках выводится из денег по цене занятия, счётчика уроков в системе нет.
export function prepaidClients(clients, subscriptions, balances, charges, {
  today = todayISO(),
  limit = 6,
} = {}) {
  const rows = []

  for (const client of clients) {
    if (isLeadClient(client)) continue

    const balance = balances.get(client.id) || 0
    if (balance <= 0) continue

    const subs = clientSubscriptions(subscriptions, client.id)
    const clientCharges = charges.filter(ch => ch.clientId === client.id)
    const left = lessonsLeft(subs, client.id, balance, clientCharges, client, today)

    rows.push({ client, balance, lessonsLeft: left })
  }

  return rows.sort((a, b) => b.balance - a.balance).slice(0, limit)
}

// Поступления в кассу за период. Только доходы: расходы и зарплаты — не то,
// что менеджер держит в голове по ходу дня.
export function incomeBetween(transactions, fromISO, toISO) {
  let total = 0
  for (const t of transactions) {
    if (t.kind !== KIND_INCOME) continue
    const date = isoOf(t.date)
    if (!date || date < fromISO || date > toISO) continue
    total += Number(t.amount) || 0
  }
  return total
}

// Дата операции хранится и строкой, и Timestamp — приводим к 'YYYY-MM-DD',
// иначе сравнение периодов молча не срабатывает (так уже ловили баг в отчётах).
function isoOf(value) {
  const date = toJsDate(value)
  return date ? toISO(date) : null
}

export const monthStartISO = (today = todayISO()) => `${today.slice(0, 7)}-01`

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
