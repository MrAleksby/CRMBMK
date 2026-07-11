// Журнал занятия: кто пришёл и сколько с него списать.
// Сумма у каждого ученика своя и всегда редактируемая — менеджер вводит её вручную,
// уже с питанием, если ребёнок ел. Система лишь подставляет подсказку.

import { suggestPrice } from './subscription.js'

export const ATTENDANCE = {
  present: { label: 'Пришёл', color: '#059669', background: '#dcfce7' },
  absent: { label: 'Пропуск', color: '#b45309', background: '#fef3c7' },
}

export const LESSON_TYPES = [
  { value: 'group', label: 'Групповой', icon: '👥' },
  { value: 'individual', label: 'Индивидуальный', icon: '🧑' },
  { value: 'trial', label: 'Пробный', icon: '✱' },
]

// Пробное занятие: помечено звёздочкой, как в AlfaCRM. Ребёнок пришёл впервые,
// группы у него ещё нет.
export const isTrial = (lesson) => lesson?.type === 'trial'

export const lessonTypeIcon = (type) =>
  LESSON_TYPES.find(t => t.value === type)?.icon || '👥'

// Список имён учеников занятия по составу. Для проведённого берём из журнала
// (там зафиксирован факт), для запланированного — из studentIds.
export function lessonStudentNames(lesson, clients) {
  const byId = new Map(clients.map(c => [c.id, c.childName]))
  if (lesson.status === 'conducted' && lesson.attendance?.length) {
    return lesson.attendance.map(a => a.clientName || byId.get(a.clientId) || '—')
  }
  return (lesson.studentIds || []).map(id => byId.get(id) || '—')
}

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
        ? String(previous.amountCharged || '')
        : String(suggestedPrice(client, subscriptions) ?? ''),
    }
  })
}

// Сколько списать с ученика за это занятие.
//
// Пропуск не означает «бесплатно». Если ребёнок не предупредил, руководитель
// решает списать, и менеджер вводит сумму вручную. Уважительная причина —
// поле остаётся пустым. Так это устроено в AlfaCRM, и в перенесённой истории
// такой случай есть.
export function journalToAttendance(rows) {
  return rows.map(row => ({
    clientId: row.clientId,
    clientName: row.clientName,
    status: row.status,
    amountCharged: Number(row.amount) || 0,
  }))
}

// Правка журнала уже проведённого занятия.
//
// Сумма занятия живёт в двух местах: в журнале (attendance[].amountCharged)
// и на лицевом счёте ученика (charges.amount). Менять их порознь нельзя —
// разъедутся. Функция считает, что именно нужно сделать, чтобы после правки
// журнал и начисления описывали одно и то же.
//
// Абонементы трогать не нужно: остаток уроков выводится из денег, а деньги
// пересчитаются сами, как только начисления встанут на место.
//
// activeSubFor(clientId) — абонемент, действовавший у ученика. Пишется в журнал
// как след истории: по нему видно, по какой цене считалось занятие.
export function planAttendanceUpdate(oldAttendance, rows, { charges, activeSubFor }) {
  const before = new Map((oldAttendance || []).map(a => [a.clientId, a]))
  const chargeOf = new Map(charges.map(c => [c.clientId, c]))

  const attendance = []
  const chargesToCreate = []
  const chargesToUpdate = []
  const chargesToDelete = []

  for (const row of rows) {
    const old = before.get(row.clientId)
    // Сумма не зависит от посещения: платный пропуск списывает деньги.
    const amount = Number(row.amount) || 0
    const charge = chargeOf.get(row.clientId)

    const record = {
      clientId: row.clientId,
      clientName: row.clientName,
      status: row.status,
      amountCharged: amount,
    }
    // Абонемент помечаем только у пришедшего: пропуск занятия не даёт.
    const subscriptionId = row.status === 'present'
      ? (old?.subscriptionId || activeSubFor(row.clientId) || undefined)
      : undefined
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

  return { attendance, chargesToCreate, chargesToUpdate, chargesToDelete }
}

export function validateJournal(rows) {
  for (const row of rows) {
    // У отсутствующего пустая сумма — норма: пропуск по уважительной причине.
    if (row.status === 'present' && row.amount === '') {
      return `Укажите сумму для «${row.clientName}»`
    }
    if (row.amount === '') continue

    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      return `Сумма «${row.clientName}» должна быть неотрицательным числом`
    }
  }
  return null
}

export const journalTotal = (rows) =>
  rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

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
      // Розовый — деньги списаны, жёлтый — пропуск прощён. Цвет = деньги.
      const charged = (record?.amountCharged ?? 0) > 0
      return charged
        ? { icon: '✗', background: '#fee2e2', color: '#dc2626',
            title: `Пропуск в долг, ${record.amountCharged.toLocaleString()} сум` }
        : { icon: '✗', background: '#fef3c7', color: '#b45309', title: 'Пропуск прощён' }
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
