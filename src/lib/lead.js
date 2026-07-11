// Лид — семья, которая ещё не стала клиентом. Живёт в канбане до конверсии
// или отказа. Ученика из лида не делаем автоматически: карточку ребёнка
// заполняет менеджер, а лид после этого уходит в архив со ссылкой на клиента.

import { SOURCES, normalizeHandle } from './client'

export { SOURCES }

// Этапы воронки повторяют AlfaCRM. Цвет усиливается по мере движения к оплате:
// серый → фиолетовый → зелёный. «Думают/не отвечают» — не шаг вперёд, а заминка,
// поэтому янтарный, как «Пауза» у клиента.
export const LEAD_STAGES = [
  { value: 'new', label: 'Не разобрано', color: '#6b7280', background: '#f3f4f6' },
  { value: 'contacted', label: 'Установлен контакт', color: '#4b5563', background: '#e5e7eb' },
  { value: 'thinking', label: 'Думают/не отвечают', color: '#b45309', background: '#fef3c7' },
  { value: 'trial_scheduled', label: 'Назначено пробное', color: '#7c3aed', background: '#ede9fe' },
  { value: 'trial_done', label: 'Проведено пробное', color: '#6d28d9', background: '#ddd6fe' },
  { value: 'paid', label: 'Получена оплата', color: '#059669', background: '#dcfce7' },
]

export const FIRST_STAGE = LEAD_STAGES[0].value

export const stageInfo = (stage) =>
  LEAD_STAGES.find(s => s.value === stage) ?? LEAD_STAGES[0]

// Следующий этап воронки. На «Получена оплата» двигать некуда:
// оттуда лид уходит только в клиенты.
export function nextStage(stage) {
  const index = LEAD_STAGES.findIndex(s => s.value === stage)
  if (index === -1) return LEAD_STAGES[1].value
  return LEAD_STAGES[index + 1]?.value ?? null
}

export const REJECT_REASONS = [
  { value: 'bad_contacts', label: 'Некорректные контакты' },
  { value: 'conditions', label: 'Не устроили условия' },
  { value: 'competitor', label: 'Ушёл к конкуренту' },
  { value: 'trial_disliked', label: 'Не понравилось пробное' },
  { value: 'other', label: 'Другое' },
]

export const rejectLabel = (value) =>
  REJECT_REASONS.find(r => r.value === value)?.label ?? value ?? ''

export const MAX_PHONES = 4

// Лид ушёл из воронки: либо стал клиентом, либо отказался.
// Конвертирован = стал клиентом: карточка есть И лид ушёл в архив. Просто
// открытая карточка (clientId без archived) — ещё лид в воронке, у него есть
// пробное и оплаты, но клиентом он пока не стал.
export const isConverted = (lead) => Boolean(lead.clientId) && Boolean(lead.archived)
export const isRejected = (lead) => Boolean(lead.archived) && !lead.clientId
export const hasCard = (lead) => Boolean(lead.clientId)

export const emptyLeadForm = () => ({
  childName: '',
  birthDate: '',
  gender: '',
  parentName: '',
  phones: [''],
  telegram: '',
  instagram: '',
  source: '',
  sourceNote: '',
  stage: FIRST_STAGE,
  note: '',
  responsibleId: '',
})

export function leadToForm(lead) {
  const form = emptyLeadForm()
  const phones = (lead.phones || []).filter(Boolean)
  return {
    ...form,
    childName: lead.childName || '',
    birthDate: lead.birthDate || '',
    gender: lead.gender || '',
    parentName: lead.parentName || '',
    phones: phones.length ? phones : [''],
    telegram: lead.telegram || '',
    instagram: lead.instagram || '',
    source: lead.source || '',
    sourceNote: lead.sourceNote || '',
    stage: lead.stage || FIRST_STAGE,
    note: lead.note || '',
    responsibleId: lead.responsibleId || '',
  }
}

export function leadFormToDoc(form) {
  return {
    childName: form.childName.trim(),
    birthDate: form.birthDate,
    gender: form.gender,
    parentName: form.parentName.trim(),
    phones: form.phones.map(p => p.trim()).filter(Boolean).slice(0, MAX_PHONES),
    telegram: normalizeHandle(form.telegram),
    instagram: normalizeHandle(form.instagram),
    source: form.source,
    sourceNote: form.source === 'other' ? form.sourceNote.trim() : '',
    stage: form.stage,
    note: form.note.trim(),
    responsibleId: form.responsibleId,
  }
}

// Возвращает текст ошибки или null.
export function validateLeadForm(form) {
  if (!form.childName.trim()) return 'Укажите, кто обратился'
  if (!LEAD_STAGES.some(s => s.value === form.stage)) return 'Выберите этап воронки'
  if (form.birthDate) {
    const birth = new Date(form.birthDate)
    if (Number.isNaN(birth.getTime())) return 'Некорректная дата рождения'
    if (birth > new Date()) return 'Дата рождения не может быть в будущем'
  }
  return null
}

export function leadSearchText(lead) {
  return [
    lead.childName, lead.parentName, lead.telegram, lead.instagram, lead.note,
    ...(lead.phones || []),
  ].filter(Boolean).join(' ').toLowerCase()
}

// Заготовка карточки ученика: то, что менеджер уже спросил у родителя,
// перебивать руками не нужно. Заказчик лида — обычно мама.
export function clientFormFromLead(lead, emptyForm) {
  const phones = (lead.phones || []).filter(Boolean)
  return {
    ...emptyForm,
    childName: lead.childName || '',
    birthDate: lead.birthDate || '',
    gender: lead.gender || '',
    mother: {
      name: lead.parentName || '',
      phones: phones.length ? phones : [''],
      instagram: lead.instagram || '',
      telegram: lead.telegram || '',
    },
    source: lead.source || '',
    sourceNote: lead.sourceNote || '',
    notes: lead.note || '',
    status: 'active',
  }
}

// Firestore отдаёт Timestamp, импорт кладёт Date, у старых записей поля нет.
export function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatLeadDate = (value) => {
  const date = toDate(value)
  return date ? date.toLocaleDateString('ru') : ''
}

// В углу карточки места мало: «02.03» вместо «02.03.2026».
export const formatShortDate = (value) => {
  const date = toDate(value)
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`
}

// Колонки канбана в порядке этапов. Внутри колонки — свежие сверху.
export function groupByStage(leads) {
  const columns = new Map(LEAD_STAGES.map(s => [s.value, []]))
  for (const lead of leads) {
    const column = columns.get(lead.stage) ?? columns.get(FIRST_STAGE)
    column.push(lead)
  }
  const newest = (a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)
  for (const column of columns.values()) column.sort(newest)
  return columns
}

// Конверсия считается от всех лидов, а не от активных: иначе она росла бы
// сама собой по мере того, как отказы уходят в архив.
export function funnelStats(leads) {
  const converted = leads.filter(isConverted).length
  const rejected = leads.filter(isRejected).length
  const active = leads.length - converted - rejected
  const rate = leads.length ? Math.round((converted / leads.length) * 100) : 0
  return { total: leads.length, active, converted, rejected, rate }
}
