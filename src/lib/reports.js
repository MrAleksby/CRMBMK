// Отчёты. Чистые функции над уже загруженными данными — ни Firestore, ни React,
// поэтому их можно прогнать скриптом и проверить цифры до деплоя.
//
// Все суммы берутся из тех же коллекций, что и остальные экраны:
//   transactions — реальные деньги (касса компании),
//   charges      — начисления ученику за проведённое занятие.
// Смешивать нельзя, иначе отчёт разойдётся с «Финансами».
//
// Период задаётся диапазоном дат [from, to] в формате 'YYYY-MM-DD', а не годом:
// в AlfaCRM у каждого отчёта была своя панель фильтров, и без произвольного
// периода не посмотреть ни квартал, ни неделю.

import { KIND_INCOME, KIND_EXPENSE, KIND_SALARY, KIND_REFUND, KIND_DRAW, toJsDate } from './finance'
import { isLeadClient } from './client'
import { isConverted } from './lead'

export const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

// --- период ------------------------------------------------------------------

export const isoDay = (date) => {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Дата операции — Timestamp, дата занятия — строка 'YYYY-MM-DD'. Приводим к одному виду.
const dayOf = (value) => {
  if (typeof value === 'string') return value.slice(0, 10)
  const date = toJsDate(value)
  return date ? isoDay(date) : null
}

const inRange = (value, { from, to }) => {
  const day = dayOf(value)
  if (!day) return false
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

const monthKey = (day) => day.slice(0, 7)     // 'YYYY-MM'

const monthLabel = (key) => {
  const [year, month] = key.split('-')
  return `${MONTHS[Number(month) - 1]} ${year}`
}

// Месяцы, попавшие в период, — по ним и строим строки отчёта.
function monthsOf({ from, to }) {
  const start = from ? new Date(`${from}T00:00:00`) : null
  const end = to ? new Date(`${to}T00:00:00`) : new Date()
  if (!start) return []

  const keys = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    keys.push(isoDay(cursor).slice(0, 7))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

// Готовые периоды: как в AlfaCRM, где фильтр открывается уже заполненным.
export function presetRange(preset, today = new Date()) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const first = (y, m) => isoDay(new Date(y, m, 1))
  const last = (y, m) => isoDay(new Date(y, m + 1, 0))

  switch (preset) {
    case 'month': return { from: first(year, month), to: last(year, month) }
    case 'prev': return { from: first(year, month - 1), to: last(year, month - 1) }
    case 'quarter': {
      const q = Math.floor(month / 3) * 3
      return { from: first(year, q), to: last(year, q + 2) }
    }
    case 'year': return { from: first(year, 0), to: last(year, 11) }
    case 'prevYear': return { from: first(year - 1, 0), to: last(year - 1, 11) }
    case 'all': return { from: '2000-01-01', to: isoDay(today) }
    default: return { from: first(year, 0), to: last(year, 11) }
  }
}

export const PRESETS = [
  { value: 'month', label: 'Этот месяц' },
  { value: 'prev', label: 'Прошлый месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Этот год' },
  { value: 'prevYear', label: 'Прошлый год' },
  { value: 'all', label: 'Всё время' },
]

// --- 1. Деньги по месяцам -----------------------------------------------------
//
// Прибыль считаем как в «Финансах»: списано за занятия − расходы − ЗП.
// Не «доходы − расходы»: оплата за абонемент приходит разом, а зарабатывается
// по мере проведённых занятий. Иначе месяц с крупной предоплатой врал бы.
export function monthlyMoney(transactions, charges, range, filters = {}) {
  const { accountId, categoryId } = filters

  const rows = new Map()
  const row = (key) => {
    if (!rows.has(key)) {
      rows.set(key, {
        key, label: monthLabel(key),
        income: 0, otherIncome: 0, expense: 0, salary: 0, refund: 0, draw: 0,
        charged: 0, lessons: 0,
      })
    }
    return rows.get(key)
  }
  for (const key of monthsOf(range)) row(key)

  for (const t of transactions) {
    if (!inRange(t.date, range)) continue
    if (accountId && t.accountId !== accountId) continue
    if (categoryId && t.categoryId !== categoryId) continue

    const target = row(monthKey(dayOf(t.date)))
    const amount = t.amount || 0
    if (t.kind === KIND_INCOME) {
      target.income += amount
      // Доход без ученика (турнир, кешбек) начислений не имеет — в прибыль
      // он попадает напрямую, иначе выпал бы из отчёта совсем.
      if (!t.clientId) target.otherIncome += amount
    }
    else if (t.kind === KIND_EXPENSE) target.expense += amount
    else if (t.kind === KIND_SALARY) target.salary += amount
    else if (t.kind === KIND_REFUND) target.refund += amount
    else if (t.kind === KIND_DRAW) target.draw += amount
  }

  // Начисления кассы и статьи не имеют, поэтому при фильтре по ним их не считаем:
  // иначе «прибыль по кассе» включала бы занятия, к этой кассе не относящиеся.
  const skipCharges = Boolean(accountId || categoryId)
  if (!skipCharges) {
    for (const c of charges) {
      if (!inRange(c.date, range)) continue
      const target = row(monthKey(dayOf(c.date)))
      target.charged += c.amount || 0
      target.lessons += c.lessons || 0
    }
  }

  const list = [...rows.values()].sort((a, b) => a.key.localeCompare(b.key))
  for (const item of list) {
    // Прибыль = оказанные услуги (charged) + доходы вне занятий − расходы − ЗП.
    // Изъятия владельца в неё не входят: школа их не тратила, владелец забрал
    // из уже заработанного. В движение по кассе (cash) — входят: денег стало меньше.
    item.profit = item.charged + item.otherIncome - item.expense - item.salary
    // Сколько прибыли осталось в деле после того, как владелец забрал своё.
    // Минус означает: вывели больше, чем заработали за этот месяц.
    item.retained = item.profit - item.draw
    item.cash = item.income - item.expense - item.salary - item.refund - item.draw
  }
  return list
}

// --- 2. Ученики и отток -------------------------------------------------------
//
// Даты ухода в базе нет, и заводить её задним числом бессмысленно. Поэтому
// «активный» — тот, у кого в этом месяце было проведённое занятие. Ушедший —
// тот, кто ходил в прошлом месяце и не пришёл ни разу в этом. Так отток
// считается по факту посещений, а не по галочке в карточке.
export function monthlyStudents(clients, lessons, transactions, range, filters = {}) {
  const { groupId, teacherId } = filters

  const students = clients.filter(c => !isLeadClient(c))
  const known = new Set(students.map(c => c.id))

  const matches = (lesson) =>
    (!groupId || lesson.groupId === groupId)
    && (!teacherId || lesson.teacherId === teacherId)

  // Кто занимался в каждом месяце — по всей истории, а не только внутри периода:
  // чтобы посчитать отток за первый месяц, нужен предыдущий.
  const activeBy = new Map()
  for (const lesson of lessons) {
    if (lesson.status !== 'conducted' || !lesson.date || !matches(lesson)) continue
    const key = monthKey(lesson.date)
    if (!activeBy.has(key)) activeBy.set(key, new Set())
    const set = activeBy.get(key)
    for (const record of (lesson.attendance || [])) {
      if (record.status === 'present' && known.has(record.clientId)) set.add(record.clientId)
    }
  }

  // Первый платёж — месяц прихода: клиент начинается с денег.
  const firstPayment = new Map()
  const paidBy = new Map()
  for (const t of transactions) {
    if (t.kind !== KIND_INCOME || !t.clientId) continue
    const day = dayOf(t.date)
    if (!day) continue
    const prev = firstPayment.get(t.clientId)
    if (!prev || day < prev) firstPayment.set(t.clientId, day)
    const key = monthKey(day)
    paidBy.set(key, (paidBy.get(key) || 0) + (t.amount || 0))
  }

  const now = new Date()
  const nowKey = isoDay(now).slice(0, 7)

  return monthsOf(range).map(key => {
    const active = activeBy.get(key) || new Set()

    const [y, m] = key.split('-').map(Number)
    const prevKey = isoDay(new Date(y, m - 2, 1)).slice(0, 7)
    const before = activeBy.get(prevKey) || new Set()

    // За текущий и будущие месяцы отток не считаем: месяц ещё не кончился,
    // и все, кто просто не успел прийти, выглядели бы ушедшими.
    const finished = key < nowKey
    const churned = finished ? [...before].filter(id => !active.has(id)).length : 0

    const joined = [...firstPayment.values()].filter(day => monthKey(day) === key).length
    const paid = paidBy.get(key) || 0

    return {
      key, label: monthLabel(key),
      active: active.size,
      joined,
      churned,
      paid,
      // Средний чек — на занимавшегося ученика, а не на всю базу.
      avgCheck: active.size ? Math.round(paid / active.size) : 0,
    }
  })
}

// --- 3. Воронка и источники ---------------------------------------------------
//
// Конверсия считается от всех лидов периода, а не от активных: иначе она росла бы
// сама по мере того, как отказы уходят в архив.
export function funnelReport(leads, stages, range, filters = {}) {
  const { source } = filters
  const list = leads.filter(l =>
    inRange(l.createdAt, range) && (!source || l.source === source))

  const total = list.length || 1
  const byStage = stages.map(stage => {
    const inStage = list.filter(l => (l.stage || stages[0].value) === stage.value)
    return { ...stage, count: inStage.length, active: inStage.filter(l => !l.archived).length }
  })

  const converted = list.filter(isConverted).length
  return {
    stages: byStage,
    total: list.length,
    converted,
    rejected: list.filter(l => l.archived && !l.clientId).length,
    conversion: Math.round((converted / total) * 100),
  }
}

// Откуда приходят те, кто действительно платит. Считаем не лиды, а деньги:
// источник, дающий сто обращений и ноль клиентов, дороже, чем кажется.
export function sourceReport(leads, clients, transactions, sources, range) {
  const paidBy = new Map()
  for (const t of transactions) {
    if (t.kind !== KIND_INCOME || !t.clientId) continue
    if (!inRange(t.date, range)) continue
    paidBy.set(t.clientId, (paidBy.get(t.clientId) || 0) + (t.amount || 0))
  }

  const periodLeads = leads.filter(l => inRange(l.createdAt, range))

  return sources.map(source => {
    const leadList = periodLeads.filter(l => l.source === source.value)
    const clientList = clients.filter(c => !isLeadClient(c) && c.source === source.value)
    // Выручка — только та, что пришла внутри периода; клиенты могли прийти раньше.
    const revenue = clientList.reduce((sum, c) => sum + (paidBy.get(c.id) || 0), 0)
    return {
      ...source,
      leads: leadList.length,
      clients: clientList.length,
      revenue,
      conversion: leadList.length
        ? Math.round((leadList.filter(isConverted).length / leadList.length) * 100)
        : null,
    }
  }).sort((a, b) => b.revenue - a.revenue)
}

// --- 4. Занятия и педагоги ----------------------------------------------------
export function monthlyLessons(lessons, charges, range, filters = {}) {
  const { teacherId, groupId, type } = filters

  const matches = (lesson) =>
    (!teacherId || lesson.teacherId === teacherId)
    && (!groupId || lesson.groupId === groupId)
    && (!type || (lesson.type || 'group') === type)

  const rows = new Map()
  const row = (key) => {
    if (!rows.has(key)) {
      rows.set(key, {
        key, label: monthLabel(key),
        conducted: 0, cancelled: 0, planned: 0, present: 0, absent: 0, charged: 0,
      })
    }
    return rows.get(key)
  }
  for (const key of monthsOf(range)) row(key)

  const countedLessons = new Set()
  for (const lesson of lessons) {
    if (!lesson.date || !inRange(lesson.date, range) || !matches(lesson)) continue
    const target = row(monthKey(lesson.date))

    if (lesson.status === 'cancelled') { target.cancelled += 1; continue }
    if (lesson.status === 'planned') { target.planned += 1; continue }

    target.conducted += 1
    countedLessons.add(lesson.id)
    for (const record of (lesson.attendance || [])) {
      if (record.status === 'present') target.present += 1
      else target.absent += 1
    }
  }

  // Списания берём только по занятиям, попавшим в фильтр: иначе цифра
  // разошлась бы с числом занятий рядом.
  for (const c of charges) {
    if (!inRange(c.date, range)) continue
    const filtered = teacherId || groupId || type
    if (filtered && !(c.lessonId && countedLessons.has(c.lessonId))) continue
    row(monthKey(dayOf(c.date))).charged += c.amount || 0
  }

  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key))
}

// --- 5. Должники и предоплаты -------------------------------------------------
//
// Баланс считается за всё время, а не за период: долг не «за июль», он просто есть.
// Период здесь ни при чём — иначе ученик, заплативший в мае за июньские занятия,
// в июньском отчёте выглядел бы должником.
export function debtorsReport(clients, transactions, charges, subscriptions, lessonsLeftFn) {
  const balances = new Map()
  const add = (clientId, delta) => {
    if (!clientId) return
    balances.set(clientId, (balances.get(clientId) || 0) + delta)
  }
  for (const t of transactions) {
    if (t.kind === KIND_INCOME) add(t.clientId, t.amount || 0)
    if (t.kind === KIND_REFUND) add(t.clientId, -(t.amount || 0))
  }
  for (const c of charges) add(c.clientId, -(c.amount || 0))

  const chargesBy = new Map()
  for (const c of charges) {
    if (!chargesBy.has(c.clientId)) chargesBy.set(c.clientId, [])
    chargesBy.get(c.clientId).push(c)
  }

  const lastPayment = new Map()
  for (const t of transactions) {
    if (t.kind !== KIND_INCOME || !t.clientId) continue
    const day = dayOf(t.date)
    if (!day) continue
    const prev = lastPayment.get(t.clientId)
    if (!prev || day > prev) lastPayment.set(t.clientId, day)
  }

  return clients
    .filter(c => !isLeadClient(c))
    .map(client => {
      const balance = balances.get(client.id) || 0
      return {
        id: client.id,
        name: client.childName,
        status: client.status || 'active',
        balance,
        // Минус — за столько занятий ученик ещё не заплатил.
        lessons: lessonsLeftFn
          ? lessonsLeftFn(subscriptions, client.id, balance, chargesBy.get(client.id) || [], client)
          : 0,
        lastPayment: lastPayment.get(client.id) || '',
      }
    })
    .filter(row => row.balance !== 0)
    .sort((a, b) => a.balance - b.balance)   // сначала самые крупные долги
}

// --- 6. Кассы и статьи --------------------------------------------------------
//
// Остаток по кассе — за всё время: касса не обнуляется первого числа. А приход
// и расход — за выбранный период: это движение, оно и должно быть периодным.
export function accountsReport(transactions, accounts, range) {
  const sign = {
    [KIND_INCOME]: 1, [KIND_EXPENSE]: -1, [KIND_SALARY]: -1, [KIND_REFUND]: -1, [KIND_DRAW]: -1,
  }

  return accounts.map(account => {
    const mine = transactions.filter(t => t.accountId === account.id)
    const inPeriod = mine.filter(t => inRange(t.date, range))

    const income = inPeriod.filter(t => t.kind === KIND_INCOME)
      .reduce((s, t) => s + (t.amount || 0), 0)
    const outcome = inPeriod.filter(t => t.kind !== KIND_INCOME)
      .reduce((s, t) => s + (t.amount || 0), 0)

    return {
      id: account.id,
      name: account.name,
      income,
      outcome,
      // Остаток — по всей истории кассы, иначе он не сойдётся с «Финансами».
      total: mine.reduce((s, t) => s + (sign[t.kind] ?? 0) * (t.amount || 0), 0),
    }
  }).sort((a, b) => b.total - a.total)
}

export function categoriesReport(transactions, categories, range, filters = {}) {
  const { kind } = filters

  return categories.map(category => {
    const mine = transactions.filter(t =>
      t.categoryId === category.id
      && inRange(t.date, range)
      && (!kind || t.kind === kind))

    return {
      id: category.id,
      name: category.name,
      kind: category.kind,
      count: mine.length,
      total: mine.reduce((s, t) => s + (t.amount || 0), 0),
    }
  })
    .filter(row => row.count > 0)
    .sort((a, b) => b.total - a.total)
}

// --- 7. Выплаты зарплат -------------------------------------------------------
//
// Рядом с выплатой показываем, сколько занятий педагог провёл за тот же период:
// так видно, сколько стоит одно занятие в его исполнении.
export function salaryReport(transactions, lessons, teachers, range) {
  const paid = transactions.filter(t => t.kind === KIND_SALARY && inRange(t.date, range))

  const rows = teachers.map(teacher => {
    const mine = paid.filter(t => t.teacherId === teacher.id)
    const conducted = lessons.filter(l =>
      l.teacherId === teacher.id
      && l.status === 'conducted'
      && l.date && inRange(l.date, range))

    const total = mine.reduce((s, t) => s + (t.amount || 0), 0)
    return {
      id: teacher.id,
      name: teacher.name,
      payments: mine.length,
      total,
      lessons: conducted.length,
      perLesson: conducted.length ? Math.round(total / conducted.length) : 0,
    }
  })

  // Выплаты без педагога тоже показываем: иначе сумма не сойдётся с «Финансами».
  const orphan = paid.filter(t => !t.teacherId)
  if (orphan.length) {
    rows.push({
      id: '(none)',
      name: '(педагог не указан)',
      payments: orphan.length,
      total: orphan.reduce((s, t) => s + (t.amount || 0), 0),
      lessons: 0,
      perLesson: 0,
    })
  }

  return rows.filter(r => r.payments > 0).sort((a, b) => b.total - a.total)
}

export function teacherReport(lessons, charges, teachers, range, filters = {}) {
  const { groupId } = filters

  const chargeByLesson = new Map()
  for (const c of charges) {
    if (!c.lessonId) continue
    chargeByLesson.set(c.lessonId, (chargeByLesson.get(c.lessonId) || 0) + (c.amount || 0))
  }

  const mineOf = (teacherId) => lessons.filter(l =>
    l.teacherId === teacherId
    && l.status === 'conducted'
    && l.date && inRange(l.date, range)
    && (!groupId || l.groupId === groupId))

  const build = (id, name, list) => ({
    id, name,
    lessons: list.length,
    present: list.reduce((s, l) => s + (l.attendance || []).filter(a => a.status === 'present').length, 0),
    absent: list.reduce((s, l) => s + (l.attendance || []).filter(a => a.status !== 'present').length, 0),
    earned: list.reduce((s, l) => s + (chargeByLesson.get(l.id) || 0), 0),
  })

  const rows = teachers.map(t => build(t.id, t.name, mineOf(t.id)))

  // Занятия без педагога — их не должно быть, но если есть, честнее показать.
  const orphan = lessons.filter(l =>
    !l.teacherId && l.status === 'conducted'
    && l.date && inRange(l.date, range)
    && (!groupId || l.groupId === groupId))
  if (orphan.length) rows.push(build('(none)', '(педагог не указан)', orphan))

  return rows.filter(r => r.lessons > 0).sort((a, b) => b.lessons - a.lessons)
}
