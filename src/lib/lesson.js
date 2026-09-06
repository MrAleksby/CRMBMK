// Журнал занятия: кто пришёл и сколько с него списать.
// Сумма у каждого ученика своя и всегда редактируемая — менеджер вводит её вручную,
// уже с питанием, если ребёнок ел. Система лишь подставляет подсказку.

import { suggestPrice } from './subscription.js'
import { normalizeDecimal } from './amount.js'

export const ATTENDANCE = {
  present: { label: 'Пришёл', color: '#059669', background: '#dcfce7' },
  absent: { label: 'Пропуск', color: '#b45309', background: '#fef3c7' },
}

export const LESSON_TYPES = [
  { value: 'group', label: 'Групповой', iconName: 'groups' },
  { value: 'individual', label: 'Индивидуальный', iconName: 'clients' },
  { value: 'trial', label: 'Пробный', iconName: 'star' },
]

// Пробное занятие: помечено звёздочкой, как в AlfaCRM. Ребёнок пришёл впервые,
// группы у него ещё нет.
export const isTrial = (lesson) => lesson?.type === 'trial'

// Имя линейной иконки типа занятия (см. components/Icon.jsx).
export const lessonTypeIconName = (type) =>
  LESSON_TYPES.find(t => t.value === type)?.iconName || 'groups'

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

// Сумма занятия делится на две части: собственно занятие и питание. В кассу и
// на лицевой счёт уходит их сумма — разбивка нужна, чтобы видеть, сколько ушло
// на еду. Поэтому `amountCharged` по-прежнему ИТОГ: все расчёты (баланс, прибыль,
// остаток в уроках, отчёты) читают его и о разбивке знать не обязаны.
const part = (value) => Number(normalizeDecimal(value)) || 0
const filled = (value) => value !== '' && value !== null && value !== undefined

export const rowTotal = (row) => part(row.amountLesson) + part(row.amountMeal)

// Строка журнала из сохранённой записи. У занятий, проведённых до разделения,
// разбивки нет вовсе — тогда весь итог кладём в «Занятие», а «Питание» оставляем
// пустым: в старой сумме еда была намешана, и объявить её нулём значило бы соврать.
export function attendanceToRow(record, clientName) {
  const hasSplit = record.amountLesson !== undefined || record.amountMeal !== undefined
  return {
    clientId: record.clientId,
    clientName: record.clientName || clientName || 'Удалённый ученик',
    status: record.status || 'present',
    amountLesson: String((hasSplit ? record.amountLesson : record.amountCharged) || ''),
    amountMeal: String((hasSplit ? record.amountMeal : '') || ''),
    comment: record.comment || '',
  }
}

export function buildJournal(lesson, clients, subscriptions = []) {
  const saved = new Map((lesson.attendance || []).map(a => [a.clientId, a]))
  const ids = lesson.studentIds || []

  return ids.map(clientId => {
    const client = clients.find(c => c.id === clientId)
    const previous = saved.get(clientId)
    if (previous) return attendanceToRow(previous, client?.childName)
    return {
      clientId,
      clientName: client?.childName || 'Удалённый ученик',
      status: 'present',
      // Подсказка цены — это цена занятия. Питание менеджер добавит сам.
      amountLesson: String(suggestedPrice(client, subscriptions) ?? ''),
      amountMeal: '',
      comment: '',
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
  return rows.map(attendanceRecord)
}

// Разбивку записываем, только когда менеджер её задал — то есть заполнил
// «Питание». Пустое поле значит «делить не стали».
//
// Это важнее, чем кажется. У занятий, проведённых до разделения, в итоге уже
// сидела еда, и дописать им «питание 0» значило бы соврать. Поэтому случайное
// пересохранение старого журнала разбивку не выдумывает: суммы остаются как есть.
const splitOf = (row) => (filled(row.amountMeal)
  ? { amountLesson: part(row.amountLesson), amountMeal: part(row.amountMeal) }
  : {})

// Запись журнала по строке формы.
function attendanceRecord(row) {
  return {
    clientId: row.clientId,
    clientName: row.clientName,
    status: row.status,
    amountCharged: rowTotal(row),
    ...splitOf(row),
    comment: (row.comment || '').trim(),
  }
}

// Поля разбивки готовой записи журнала — для документа начисления.
// Ключей может не быть вовсе, и подставлять вместо них undefined нельзя:
// Firestore отвергает такую запись целиком («Unsupported field value: undefined»),
// и занятие не проводится. Поэтому отдаём пустой объект, а не пару undefined.
export const splitFields = (record) => (record.amountMeal === undefined ? {} : {
  amountLesson: record.amountLesson,
  amountMeal: record.amountMeal,
})

// Те же поля, но для начисления: на лицевом счёте лежит ИТОГ, разбивка — справкой.
const chargeParts = (row) => ({
  amount: rowTotal(row),
  ...splitOf(row),
  comment: (row.comment || '').trim(),
})

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
    const amount = rowTotal(row)
    const charge = chargeOf.get(row.clientId)

    const record = attendanceRecord(row)
    // Абонемент помечаем только у пришедшего: пропуск занятия не даёт.
    const subscriptionId = row.status === 'present'
      ? (old?.subscriptionId || activeSubFor(row.clientId) || undefined)
      : undefined
    if (subscriptionId) record.subscriptionId = subscriptionId
    attendance.push(record)

    // Начисление существует только там, где есть что списывать.
    if (amount > 0 && !charge) {
      chargesToCreate.push({ clientId: row.clientId, clientName: row.clientName, ...chargeParts(row) })
    } else if (amount > 0 && charge && !sameCharge(charge, row)) {
      chargesToUpdate.push({ id: charge.id, ...chargeParts(row) })
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

// Начисление надо переписать, если изменилась хоть одна из частей: итог мог
// остаться прежним, а деньги переехать из занятия в питание.
function sameCharge(charge, row) {
  const next = chargeParts(row)
  return charge.amount === next.amount
    && (charge.amountLesson ?? null) === (next.amountLesson ?? null)
    && (charge.amountMeal ?? null) === (next.amountMeal ?? null)
    && (charge.comment || '') === next.comment
}

// Что не так с одной строкой журнала. null — всё в порядке.
function rowProblem(row) {
  // У отсутствующего пустые суммы — норма: пропуск по уважительной причине.
  // У пришедшего должна быть заполнена хотя бы одна часть: бывает занятие
  // без питания и, наоборот, одно питание без занятия.
  if (row.status === 'present' && !filled(row.amountLesson) && !filled(row.amountMeal)) {
    return 'сумма не указана'
  }
  for (const [field, label] of [['amountLesson', 'занятие'], ['amountMeal', 'питание']]) {
    if (!filled(row[field])) continue
    const value = Number(normalizeDecimal(row[field]))
    if (!Number.isFinite(value) || value < 0) return `${label}: не похоже на сумму`
  }
  return null
}

// Все проблемные строки разом, а не первая попавшаяся.
//
// Раньше проверка возвращала одного ученика за раз: менеджер исправлял его,
// жал «Провести», получал следующего — и так по кругу, не понимая, сколько
// их всего. При двенадцати детях в группе это пытка.
export function journalProblems(rows) {
  return rows
    .map(row => ({ clientId: row.clientId, clientName: row.clientName, problem: rowProblem(row) }))
    .filter(row => row.problem)
}

export function validateJournal(rows) {
  const problems = journalProblems(rows)
  if (problems.length === 0) return null
  if (problems.length === 1) {
    const only = problems[0]
    return `«${only.clientName}» — ${only.problem}`
  }
  return `Не заполнено у ${problems.length}: ` + problems.map(p => `«${p.clientName}»`).join(', ')
}

export const journalTotal = (rows) => rows.reduce((sum, r) => sum + rowTotal(r), 0)

// Сколько из итога приходится на еду — подсказка под журналом.
export const journalMealTotal = (rows) => rows.reduce((sum, r) => sum + part(r.amountMeal), 0)

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
