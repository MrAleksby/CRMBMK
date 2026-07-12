// Отчёты. Чистые функции над уже загруженными данными — ни Firestore, ни React,
// поэтому их можно прогнать скриптом и проверить цифры до деплоя.
//
// Все суммы берутся из тех же коллекций, что и остальные экраны:
//   transactions — реальные деньги (касса компании),
//   charges      — начисления ученику за проведённое занятие.
// Смешивать нельзя, иначе отчёт разойдётся с «Финансами».

import { KIND_INCOME, KIND_EXPENSE, KIND_SALARY, KIND_REFUND, toJsDate } from './finance'
import { isLeadClient } from './client'
import { isConverted } from './lead'

export const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

const monthOf = (value) => {
  const date = toJsDate(value)
  return date ? { year: date.getFullYear(), month: date.getMonth() } : null
}

const emptyMonths = (year) => MONTHS.map((label, month) => ({ year, month, label }))

// --- 1. Деньги по месяцам -----------------------------------------------------
//
// Прибыль считаем как в «Финансах»: списано за занятия − расходы − ЗП.
// Не «доходы − расходы»: оплата за абонемент приходит разом, а зарабатывается
// по мере проведённых занятий. Иначе месяц с крупной предоплатой врал бы.
export function monthlyMoney(transactions, charges, year) {
  const rows = emptyMonths(year).map(m => ({
    ...m, income: 0, expense: 0, salary: 0, refund: 0, charged: 0, lessons: 0,
  }))

  for (const t of transactions) {
    const at = monthOf(t.date)
    if (!at || at.year !== year) continue
    const row = rows[at.month]
    const amount = t.amount || 0
    if (t.kind === KIND_INCOME) row.income += amount
    else if (t.kind === KIND_EXPENSE) row.expense += amount
    else if (t.kind === KIND_SALARY) row.salary += amount
    else if (t.kind === KIND_REFUND) row.refund += amount
  }

  for (const c of charges) {
    const at = monthOf(c.date)
    if (!at || at.year !== year) continue
    rows[at.month].charged += c.amount || 0
    rows[at.month].lessons += c.lessons || 0
  }

  for (const row of rows) {
    row.profit = row.charged - row.expense - row.salary
    row.cash = row.income - row.expense - row.salary - row.refund
  }
  return rows
}

// --- 2. Ученики и отток -------------------------------------------------------
//
// Даты ухода в базе нет, и заводить её задним числом бессмысленно. Поэтому
// «активный» — тот, у кого в этом месяце было проведённое занятие. Ушедший —
// тот, кто ходил в прошлом месяце и не пришёл ни разу в этом. Так отток
// считается по факту посещений, а не по галочке в карточке.
export function monthlyStudents(clients, lessons, transactions, year) {
  const students = clients.filter(c => !isLeadClient(c))
  const known = new Set(students.map(c => c.id))

  // Кто занимался в каждом месяце
  const activeBy = new Map()   // 'YYYY-M' -> Set(clientId)
  for (const lesson of lessons) {
    if (lesson.status !== 'conducted') continue
    const at = monthOf(lesson.date ? new Date(lesson.date) : null)
    if (!at) continue
    const key = `${at.year}-${at.month}`
    if (!activeBy.has(key)) activeBy.set(key, new Set())
    const set = activeBy.get(key)
    for (const record of (lesson.attendance || [])) {
      if (record.status === 'present' && known.has(record.clientId)) set.add(record.clientId)
    }
  }

  // Первый платёж — считаем месяцем прихода: клиент начался с денег.
  const firstPayment = new Map()
  for (const t of transactions) {
    if (t.kind !== KIND_INCOME || !t.clientId || !known.has(t.clientId)) continue
    const date = toJsDate(t.date)
    if (!date) continue
    const prev = firstPayment.get(t.clientId)
    if (!prev || date < prev) firstPayment.set(t.clientId, date)
  }

  const paidBy = new Map()   // 'YYYY-M' -> сумма оплат
  for (const t of transactions) {
    if (t.kind !== KIND_INCOME || !t.clientId) continue
    const at = monthOf(t.date)
    if (!at) continue
    const key = `${at.year}-${at.month}`
    paidBy.set(key, (paidBy.get(key) || 0) + (t.amount || 0))
  }

  return emptyMonths(year).map(m => {
    const key = `${m.year}-${m.month}`
    const active = activeBy.get(key) || new Set()

    const prevDate = new Date(m.year, m.month - 1, 1)
    const prevKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}`
    const before = activeBy.get(prevKey) || new Set()

    // Ушёл: ходил в прошлом месяце, в этом не появился.
    //
    // Для текущего и будущих месяцев отток не считаем: месяц ещё не кончился,
    // и все, кто просто не успел прийти, выглядели бы ушедшими.
    const now = new Date()
    const finished = m.year < now.getFullYear()
      || (m.year === now.getFullYear() && m.month < now.getMonth())
    const churned = finished ? [...before].filter(id => !active.has(id)) : []

    const joined = [...firstPayment.entries()].filter(([, date]) =>
      date.getFullYear() === m.year && date.getMonth() === m.month).length

    const paid = paidBy.get(key) || 0

    return {
      ...m,
      active: active.size,
      joined,
      churned: churned.length,
      paid,
      // Средний чек — на занимавшегося ученика, а не на всю базу.
      avgCheck: active.size ? Math.round(paid / active.size) : 0,
    }
  })
}

// --- 3. Воронка и источники ---------------------------------------------------
//
// Конверсия считается от всех лидов, а не от активных: иначе она росла бы сама
// по мере того, как отказы уходят в архив.
export function funnelReport(leads, stages) {
  const total = leads.length || 1
  const byStage = stages.map(stage => {
    const list = leads.filter(l => (l.stage || stages[0].value) === stage.value)
    return {
      ...stage,
      count: list.length,
      active: list.filter(l => !l.archived).length,
    }
  })
  const converted = leads.filter(isConverted).length
  return {
    stages: byStage,
    total: leads.length,
    converted,
    rejected: leads.filter(l => l.archived && !l.clientId).length,
    conversion: Math.round((converted / total) * 100),
  }
}

// Откуда приходят те, кто действительно платит. Считаем не лиды, а конверсию:
// источник, дающий сто лидов и ноль клиентов, дороже, чем кажется.
export function sourceReport(leads, clients, transactions, sources) {
  const paidBy = new Map()
  for (const t of transactions) {
    if (t.kind !== KIND_INCOME || !t.clientId) continue
    paidBy.set(t.clientId, (paidBy.get(t.clientId) || 0) + (t.amount || 0))
  }

  const rows = sources.map(source => {
    const leadList = leads.filter(l => l.source === source.value)
    const clientList = clients.filter(c => !isLeadClient(c) && c.source === source.value)
    const revenue = clientList.reduce((sum, c) => sum + (paidBy.get(c.id) || 0), 0)
    return {
      ...source,
      leads: leadList.length,
      clients: clientList.length,
      revenue,
      // Из скольких лидов этого источника вышел клиент.
      conversion: leadList.length ? Math.round((leadList.filter(isConverted).length / leadList.length) * 100) : null,
    }
  })

  return rows.sort((a, b) => b.revenue - a.revenue)
}

// --- 4. Занятия и педагоги ----------------------------------------------------
export function monthlyLessons(lessons, charges, year) {
  const rows = emptyMonths(year).map(m => ({
    ...m, conducted: 0, cancelled: 0, present: 0, absent: 0, charged: 0,
  }))

  for (const lesson of lessons) {
    const date = lesson.date ? new Date(lesson.date) : null
    if (!date || date.getFullYear() !== year) continue
    const row = rows[date.getMonth()]

    if (lesson.status === 'cancelled') row.cancelled += 1
    if (lesson.status !== 'conducted') continue

    row.conducted += 1
    for (const record of (lesson.attendance || [])) {
      if (record.status === 'present') row.present += 1
      else row.absent += 1
    }
  }

  for (const c of charges) {
    const at = monthOf(c.date)
    if (!at || at.year !== year) continue
    rows[at.month].charged += c.amount || 0
  }

  return rows
}

export function teacherReport(lessons, charges, teachers, year) {
  const chargeByLesson = new Map()
  for (const c of charges) {
    if (!c.lessonId) continue
    chargeByLesson.set(c.lessonId, (chargeByLesson.get(c.lessonId) || 0) + (c.amount || 0))
  }

  const rows = teachers.map(teacher => {
    const mine = lessons.filter(l =>
      l.teacherId === teacher.id
      && l.status === 'conducted'
      && l.date && new Date(l.date).getFullYear() === year)

    const present = mine.reduce((sum, l) =>
      sum + (l.attendance || []).filter(a => a.status === 'present').length, 0)
    const earned = mine.reduce((sum, l) => sum + (chargeByLesson.get(l.id) || 0), 0)

    return { id: teacher.id, name: teacher.name, lessons: mine.length, present, earned }
  })

  // Занятия без педагога — их не должно быть, но если есть, честнее показать.
  const orphan = lessons.filter(l =>
    !l.teacherId && l.status === 'conducted'
    && l.date && new Date(l.date).getFullYear() === year)
  if (orphan.length) {
    rows.push({
      id: '(none)', name: '(педагог не указан)', lessons: orphan.length,
      present: orphan.reduce((s, l) => s + (l.attendance || []).filter(a => a.status === 'present').length, 0),
      earned: orphan.reduce((s, l) => s + (chargeByLesson.get(l.id) || 0), 0),
    })
  }

  return rows.filter(r => r.lessons > 0).sort((a, b) => b.lessons - a.lessons)
}

// Годы, за которые вообще есть данные — для селектора периода.
export function reportYears(transactions, lessons) {
  const years = new Set()
  for (const t of transactions) {
    const date = toJsDate(t.date)
    if (date) years.add(date.getFullYear())
  }
  for (const l of lessons) {
    if (l.date) years.add(new Date(l.date).getFullYear())
  }
  if (years.size === 0) years.add(new Date().getFullYear())
  return [...years].sort((a, b) => b - a)
}
