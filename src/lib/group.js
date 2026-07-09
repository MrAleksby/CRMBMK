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

export const emptyGroupForm = () => ({
  name: '',
  teacherId: '',
  mode: 'weekly',
  weekdays: [6],
  dateFrom: '',
  dateTo: '',
  timeFrom: '11:00',
  timeTo: '16:00',
  studentIds: [],
})

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

// Все даты серии. Для weekly — только выбранные дни недели, для range — каждый день.
export function generateDates(form) {
  const start = toDate(form.dateFrom)
  const end = toDate(form.dateTo || form.dateFrom)
  if (!start || !end || end < start) return []

  const dates = []
  const cursor = new Date(start)
  while (cursor <= end && dates.length < MAX_LESSONS_PER_GROUP) {
    const matches = form.mode === 'range' || form.weekdays.includes(isoWeekday(cursor))
    if (matches) dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function validateGroupForm(form) {
  if (!form.name.trim()) return 'Укажите название группы'
  if (!form.dateFrom) return 'Укажите дату начала'
  if (form.mode === 'range' && !form.dateTo) return 'Укажите дату окончания интенсива'
  if (form.dateTo && form.dateTo < form.dateFrom) return 'Дата окончания раньше даты начала'
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
  return {
    ...emptyGroupForm(),
    ...group,
    weekdays: group.weekdays ?? [],
    studentIds: group.studentIds ?? [],
    dateTo: group.dateTo || '',
  }
}

export function formToGroupDoc(form) {
  return {
    name: form.name.trim(),
    teacherId: form.teacherId,
    mode: form.mode,
    weekdays: form.mode === 'weekly' ? [...form.weekdays].sort((a, b) => a - b) : [],
    dateFrom: form.dateFrom,
    dateTo: form.dateTo || form.dateFrom,
    timeFrom: form.timeFrom,
    timeTo: form.timeTo,
    studentIds: form.studentIds,
  }
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
  const from = format(group.dateFrom)
  const to = format(group.dateTo)
  if (!from) return ''
  return from === to ? from : `${from} — ${to}`
}
