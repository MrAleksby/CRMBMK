// Журнал занятия: кто пришёл и сколько с него списать.
// Сумма у каждого ученика своя и всегда редактируемая — менеджер вводит её вручную,
// уже с питанием, если ребёнок ел. Система лишь подставляет подсказку.

import { suggestPrice } from './subscription.js'

export const ATTENDANCE = {
  present: { label: 'Пришёл', color: '#059669', background: '#dcfce7' },
  absent: { label: 'Пропуск', color: '#b45309', background: '#fef3c7' },
}

export const LESSON_TYPES = [
  { value: 'group', label: 'Групповой' },
  { value: 'individual', label: 'Индивидуальный' },
  { value: 'trial', label: 'Пробный' },
]

// Подсказка суммы по цепочке: абонемент → персональная цена ребёнка → пусто.
// Пустое поле означает, что менеджер введёт сумму сам.
export function suggestedPrice(client, subscriptions = []) {
  return suggestPrice(client, subscriptions)
}

export function buildJournal(lesson, clients, subscriptions = []) {
  const saved = new Map((lesson.attendance || []).map(a => [a.clientId, a]))
  const ids = lesson.studentIds || []

  return ids.map(clientId => {
    const client = clients.find(c => c.id === clientId)
    const previous = saved.get(clientId)
    return {
      clientId,
      clientName: client?.childName || 'Удалённый ученик',
      status: previous?.status || 'present',
      amount: previous
        ? String(previous.amountCharged ?? '')
        : String(suggestedPrice(client, subscriptions) ?? ''),
    }
  })
}

// Итог журнала: сколько ученик заплатит за это занятие.
// У отсутствующих сумма не берётся — пропустил, значит не платит.
export function journalToAttendance(rows) {
  return rows.map(row => ({
    clientId: row.clientId,
    clientName: row.clientName,
    status: row.status,
    amountCharged: row.status === 'present' ? (Number(row.amount) || 0) : 0,
  }))
}

// Правка журнала уже проведённого занятия.
//
// Сумма занятия живёт в двух местах: в журнале (attendance[].amountCharged)
// и на лицевом счёте ученика (charges.amount). Менять их порознь нельзя —
// разъедутся. Функция считает, что именно нужно сделать, чтобы после правки
// journal, charges и абонементы описывали одно и то же.
//
// activeSubFor(clientId) — абонемент, с которого списать урок вернувшемуся ученику.
export function planAttendanceUpdate(oldAttendance, rows, { charges, activeSubFor }) {
  const before = new Map((oldAttendance || []).map(a => [a.clientId, a]))
  const chargeOf = new Map(charges.map(c => [c.clientId, c]))

  const attendance = []
  const subscriptionDelta = new Map()
  const chargesToCreate = []
  const chargesToUpdate = []
  const chargesToDelete = []

  const bumpSub = (subId, delta) => {
    if (!subId) return
    subscriptionDelta.set(subId, (subscriptionDelta.get(subId) || 0) + delta)
  }

  for (const row of rows) {
    const old = before.get(row.clientId)
    const wasPresent = old?.status === 'present'
    const nowPresent = row.status === 'present'
    const amount = nowPresent ? (Number(row.amount) || 0) : 0
    const charge = chargeOf.get(row.clientId)

    // Урок с абонемента списан при проведении. Пропуск возвращает его обратно,
    // возвращение ученика — списывает снова, уже с действующего абонемента.
    let subscriptionId = old?.subscriptionId
    if (wasPresent && !nowPresent) {
      bumpSub(subscriptionId, -1)
      subscriptionId = undefined
    } else if (!wasPresent && nowPresent) {
      subscriptionId = activeSubFor(row.clientId) || undefined
      bumpSub(subscriptionId, 1)
    }

    const record = {
      clientId: row.clientId,
      clientName: row.clientName,
      status: row.status,
      amountCharged: amount,
    }
    if (subscriptionId) record.subscriptionId = subscriptionId
    attendance.push(record)

    // Начисление существует только там, где есть что списывать.
    if (amount > 0 && !charge) {
      chargesToCreate.push({ clientId: row.clientId, clientName: row.clientName, amount })
    } else if (amount > 0 && charge && charge.amount !== amount) {
      chargesToUpdate.push({ id: charge.id, amount })
    } else if (amount === 0 && charge) {
      chargesToDelete.push(charge.id)
    }
  }

  // Ученик, убранный из состава занятия, не должен остаться с начислением.
  const kept = new Set(rows.map(r => r.clientId))
  for (const charge of charges) {
    if (!kept.has(charge.clientId)) chargesToDelete.push(charge.id)
  }

  return { attendance, subscriptionDelta, chargesToCreate, chargesToUpdate, chargesToDelete }
}

export function validateJournal(rows) {
  for (const row of rows) {
    if (row.status !== 'present') continue
    if (row.amount === '') return `Укажите сумму для «${row.clientName}»`
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      return `Сумма «${row.clientName}» должна быть неотрицательным числом`
    }
  }
  return null
}

export const journalTotal = (rows) =>
  rows.reduce((sum, r) => sum + (r.status === 'present' ? (Number(r.amount) || 0) : 0), 0)

export const lessonTypeLabel = (type) =>
  LESSON_TYPES.find(t => t.value === type)?.label || 'Групповой'

export function formatLessonDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Состояние плитки в виджете посещений.
// Цвет говорит о деньгах, значок — о факте, как в AlfaCRM.
export function attendanceTile(lesson, clientId) {
  const record = (lesson.attendance || []).find(a => a.clientId === clientId)
  const today = new Date().toISOString().slice(0, 10)

  if (lesson.status === 'cancelled') {
    return { icon: '⊖', background: '#f3f4f6', color: '#9ca3af', strike: true, title: 'Отменён' }
  }
  if (lesson.status === 'conducted') {
    if (record?.status === 'absent') {
      return { icon: '✗', background: '#fef3c7', color: '#b45309', title: 'Пропуск' }
    }
    const paid = (record?.amountCharged ?? 0) > 0
    return paid
      ? { icon: '✓', background: '#dcfce7', color: '#059669', title: `Проведён, ${record.amountCharged.toLocaleString()} сум` }
      : { icon: '✓', background: '#fef3c7', color: '#b45309', title: 'Проведён бесплатно' }
  }
  if (lesson.date < today) {
    return { icon: '?', background: '#ffffff', color: '#dc2626', dashed: true, title: 'Забыли провести?' }
  }
  return { icon: '', background: '#f3f4f6', color: '#4b5563', title: 'Запланирован' }
}
