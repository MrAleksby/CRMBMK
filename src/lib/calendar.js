// Сетка календаря: месяц, неделя, день. Даты — строки 'YYYY-MM-DD'.
import { toISO, isoWeekday } from './group.js'

export const VIEWS = [
  { value: 'month', label: 'Месяц' },
  { value: 'week', label: 'Неделя' },
  { value: 'day', label: 'День' },
]

export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 20
export const HOUR_HEIGHT = 56

export const WEEKDAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

// Понедельник недели, в которую попадает date.
export function startOfWeek(date) {
  return addDays(date, -(isoWeekday(date) - 1))
}

export function weekDays(date) {
  const monday = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

// Полная сетка месяца: недели по 7 дней, с хвостами соседних месяцев.
export function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const start = startOfWeek(first)
  const weeks = []
  let cursor = start
  while (cursor <= last || weeks.length === 0 || isoWeekday(cursor) !== 1) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)))
    cursor = addDays(cursor, 7)
    if (weeks.length > 6) break
  }
  return weeks
}

export function shiftDate(date, view, direction) {
  if (view === 'day') return addDays(date, direction)
  if (view === 'week') return addDays(date, direction * 7)
  return new Date(date.getFullYear(), date.getMonth() + direction, 1)
}

export function rangeTitle(date, view) {
  if (view === 'day') {
    return `${date.getDate()} ${MONTHS_GEN[date.getMonth()]} ${date.getFullYear()} г.`
  }
  if (view === 'week') {
    const days = weekDays(date)
    const from = days[0]
    const to = days[6]
    const fromLabel = `${from.getDate()} ${MONTHS_GEN[from.getMonth()]}`
    const toLabel = `${to.getDate()} ${MONTHS_GEN[to.getMonth()]} ${to.getFullYear()} г.`
    return `${fromLabel} – ${toLabel}`
  }
  return `${MONTHS_NOM[date.getMonth()]} ${date.getFullYear()}`
}

export const minutesOf = (time) => {
  const [h, m] = String(time || '0:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Положение занятия в часовой сетке: отступ сверху и высота в пикселях.
export function lessonBox(lesson) {
  const from = minutesOf(lesson.timeFrom)
  const to = Math.max(minutesOf(lesson.timeTo), from + 30)
  const top = ((from - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT
  const height = ((to - from) / 60) * HOUR_HEIGHT
  return { top: Math.max(top, 0), height: Math.max(height, 28) }
}

export const durationMinutes = (lesson) =>
  Math.max(minutesOf(lesson.timeTo) - minutesOf(lesson.timeFrom), 0)

export const lessonsOn = (lessons, date) => {
  const iso = toISO(date)
  return lessons
    .filter(l => l.date === iso)
    .sort((a, b) => minutesOf(a.timeFrom) - minutesOf(b.timeFrom))
}

export const hours = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
)

export { toISO }
