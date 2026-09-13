// Группа — это серия занятий: расписание + состав учеников.
// «Группа сб 11» повторяется каждую субботу, «Интенсив» идёт подряд несколько дней.

export const MAX_LESSONS_PER_GROUP = 200

export const WEEKDAYS = [
  { value: 1, short: 'Пн', label: 'Понедельник' },
  { value: 2, short: 'Вт', label: 'Вторник' },
  { value: 3, short: 'Ср', label: 'Среда' },
  { value: 4, short: 'Чт', label: 'Четверг' },
  { value: 5, short: 'Пт', label: 'Пятница' },
  { value: 6, short: 'Сб', label: 'Суббота' },
  { value: 7, short: 'Вс', label: 'Воскресенье' },
]

export const GROUP_MODES = [
  { value: 'weekly', label: 'По дням недели', hint: 'Например, каждую субботу с 11:00' },
  { value: 'range', label: 'Подряд, день за днём', hint: 'Интенсив или турнир на несколько дней' },
]

export const LESSON_STATUSES = {
  planned: { label: 'Запланирован', color: '#4b5563', background: '#f3f4f6' },
  conducted: { label: 'Проведён', color: '#059669', background: '#dcfce7' },
  cancelled: { label: 'Отменён', color: '#6b7280', background: '#f3f4f6' },
}

// Периодов у группы может быть несколько.
//
// Каникулярная группа идёт окнами: лето, осенние, зимние, весенние каникулы,
// а между ними пауза. Одним отрезком это не описать: пришлось бы либо заводить
// новую группу на каждые каникулы (и терять историю и состав), либо растянуть
// период на год и потом руками удалять занятия учебного времени.
//
// Поэтому группа хранит список отрезков, а расписание применяется внутри
// каждого. Возобновить группу = добавить ещё один период.
export const emptyPeriod = () => ({ from: '', to: '' })

export const emptyGroupForm = () => ({
  name: '',
  teacherId: '',
  mode: 'weekly',
  weekdays: [6],
  periods: [emptyPeriod()],
  timeFrom: '11:00',
  timeTo: '16:00',
  studentIds: [],
})

// Периоды группы. Старые группы хранят один отрезок в dateFrom/dateTo —
// читаем их как период, чтобы ничего не переносить в базе.
export function groupPeriods(source) {
  const list = Array.isArray(source?.periods) ? source.periods : []
  const clean = list
    .map(p => ({ from: p.from || '', to: p.to || p.from || '' }))
    .filter(p => p.from)
  if (clean.length) return clean
  return source?.dateFrom ? [{ from: source.dateFrom, to: source.dateTo || source.dateFrom }] : []
}

const toDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export const toISO = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Понедельник = 1 ... Воскресенье = 7 (getDay отдаёт 0 для воскресенья).
export const isoWeekday = (date) => date.getDay() === 0 ? 7 : date.getDay()

export const todayISO = () => toISO(new Date())

// Все даты серии: расписание применяется внутри каждого периода.
// Для weekly — только выбранные дни недели, для range — каждый день.
//
// Пересекающиеся периоды не запрещаем: даты уникальны, поэтому два занятия
// на один день не появятся, а требовать от менеджера аккуратной арифметики
// с отрезками незачем.
export function generateDates(form) {
  const dates = new Set()

  for (const period of groupPeriods(form)) {
    const start = toDate(period.from)
    const end = toDate(period.to || period.from)
    if (!start || !end || end < start) continue

    const cursor = new Date(start)
    while (cursor <= end && dates.size < MAX_LESSONS_PER_GROUP) {
      const matches = form.mode === 'range' || form.weekdays.includes(isoWeekday(cursor))
      if (matches) dates.add(toISO(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return [...dates].sort()
}

export function validateGroupForm(form) {
  if (!form.name.trim()) return 'Укажите название группы'
  const periods = groupPeriods(form)
  if (!periods.length) return 'Укажите период занятий'
  for (const period of periods) {
    if (form.mode === 'range' && !period.to) return 'Укажите дату окончания интенсива'
    if (period.to && period.to < period.from) return 'Дата окончания раньше даты начала'
  }
  if (form.mode === 'weekly' && form.weekdays.length === 0) return 'Выберите хотя бы один день недели'
  if (form.timeTo <= form.timeFrom) return 'Время окончания должно быть позже начала'

  const dates = generateDates(form)
  if (dates.length === 0) return 'В выбранном периоде нет ни одного занятия'
  if (dates.length >= MAX_LESSONS_PER_GROUP) {
    return `Слишком много занятий (${MAX_LESSONS_PER_GROUP}+). Сократите период`
  }
  return null
}

export function groupToForm(group) {
  const periods = groupPeriods(group)
  return {
    ...emptyGroupForm(),
    ...group,
    weekdays: group.weekdays ?? [],
    studentIds: group.studentIds ?? [],
    periods: periods.length ? periods : [emptyPeriod()],
  }
}

export function formToGroupDoc(form) {
  const periods = groupPeriods(form)
    .map(p => ({ from: p.from, to: p.to || p.from }))
    .sort((a, b) => a.from.localeCompare(b.from))

  return {
    name: form.name.trim(),
    teacherId: form.teacherId,
    mode: form.mode,
    weekdays: form.mode === 'weekly' ? [...form.weekdays].sort((a, b) => a - b) : [],
    periods,
    // Границы всей серии оставляем рядом: по ним сортируют и отбирают группы,
    // и старые записи без `periods` читаются той же парой полей.
    dateFrom: periods[0]?.from || '',
    dateTo: periods.reduce((last, p) => (p.to > last ? p.to : last), periods[0]?.to || ''),
    timeFrom: form.timeFrom,
    timeTo: form.timeTo,
    studentIds: form.studentIds,
  }
}

// Что сделать с занятиями группы, когда поменяли её расписание или период.
//
// Раньше расписание замораживалось целиком, стоило провести хотя бы одно
// занятие. Из-за этого группу, которая уже не ведётся, нельзя было закрыть
// датой: приходилось отменять занятия по одному, и календарь пестрел
// перечёркнутыми плитками.
//
// Правило простое и безопасное: **проведённые занятия не трогаем никогда**,
// за ними стоят списания. Меняются только запланированные:
//
// - лишние (нет в новом расписании) удаляются, в том числе прошедшие,
//   которые так и не провели;
// - недостающие создаются;
// - совпавшие остаются как есть, со своим составом и правками.
//
// Дата, на которую уже есть проведённое занятие, второй раз не создаётся:
// иначе после сдвига периода в календаре появился бы дубль.
export function planScheduleChange(lessons, dates) {
  const wanted = new Set(dates)
  const planned = lessons.filter(l => l.status === 'planned')
  const busy = new Set(lessons.filter(l => l.status !== 'planned').map(l => l.date))

  const keep = new Set()
  const toDelete = []
  for (const lesson of planned) {
    if (wanted.has(lesson.date) && !keep.has(lesson.date)) keep.add(lesson.date)
    else toDelete.push(lesson)
  }

  const toCreate = dates.filter(date => !keep.has(date) && !busy.has(date))
  return { toDelete, toCreate, kept: keep.size }
}

// Занятие «трогать нельзя», если оно уже проведено или прошло:
// правка состава задним числом сдвинула бы балансы.
export const isEditableLesson = (lesson) =>
  lesson.status === 'planned' && lesson.date >= todayISO()

export function scheduleLabel(group) {
  const time = `${group.timeFrom}–${group.timeTo}`
  if (group.mode === 'range') return `Подряд, ${time}`
  const days = (group.weekdays ?? [])
    .map(w => WEEKDAYS.find(d => d.value === w)?.short)
    .filter(Boolean)
    .join(', ')
  return days ? `${days} · ${time}` : time
}

export function periodLabel(group) {
  const format = (iso) => iso ? new Date(iso).toLocaleDateString('ru') : ''
  const periods = groupPeriods(group)
  if (!periods.length) return ''

  const one = (p) => {
    const from = format(p.from)
    const to = format(p.to)
    return from === to ? from : `${from} — ${to}`
  }
  // Больше двух отрезков в чип не влезает: у каникулярной группы их четыре
  // за год, и строка растянула бы карточку на две строки.
  if (periods.length <= 2) return periods.map(one).join(', ')
  return `${one(periods[0])} и ещё ${periods.length - 1}`
}
