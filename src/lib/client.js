// Справочники и хелперы для карточки клиента.

export const GENDERS = [
  { value: 'male', label: 'Мальчик', icon: '👦' },
  { value: 'female', label: 'Девочка', icon: '👧' },
]

export const SOURCES = [
  { value: 'instagram_ads', label: 'Реклама в Instagram', icon: '📸' },
  { value: 'telegram_ads', label: 'Реклама в Telegram', icon: '✈️' },
  { value: 'recommendation', label: 'По рекомендации', icon: '🤝' },
  { value: 'other', label: 'Другое', icon: '❓' },
]

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export const MAX_PHONES = 4

const emptyParent = () => ({ name: '', phones: [''], instagram: '', telegram: '' })

// Телефоны хранятся списком. У родителей, заведённых до этого,
// был один номер в поле phone — читаем его как список из одного элемента.
export function parentPhones(parent) {
  if (!parent) return []
  if (Array.isArray(parent.phones)) return parent.phones.filter(Boolean)
  return parent.phone ? [parent.phone] : []
}

export const PAYER_TYPES = [
  { value: 'parent', label: '👤 Родители' },
  { value: 'legal', label: '🏛️ Юр. лицо' },
]

export const emptyClientForm = () => ({
  childName: '',
  birthDate: '',
  gender: '',
  childContacts: '',
  mother: emptyParent(),
  father: emptyParent(),
  source: '',
  sourceNote: '',
  allergies: '',
  notes: '',
  lessonPrice: '',
  payerType: 'parent',
  legalEntityId: '',
})

// Дата рождения хранится строкой 'YYYY-MM-DD' — так её отдаёт <input type="date">
// и так она не зависит от часового пояса.
export function calcAge(birthDate) {
  if (!birthDate) return null
  const [y, m, d] = birthDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const now = new Date()
  let age = now.getFullYear() - y
  const monthDiff = now.getMonth() + 1 - m
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age--
  return age >= 0 && age < 120 ? age : null
}

// Возраст берём из даты рождения; у старых клиентов её нет — падаем на childAge.
export function getAge(client) {
  const fromBirth = calcAge(client.birthDate)
  if (fromBirth !== null) return fromBirth
  return Number.isInteger(client.childAge) ? client.childAge : null
}

export function ageLabel(age) {
  const lastTwo = age % 100
  if (lastTwo >= 11 && lastTwo <= 14) return `${age} лет`
  switch (age % 10) {
    case 1: return `${age} год`
    case 2:
    case 3:
    case 4: return `${age} года`
    default: return `${age} лет`
  }
}

export function formatBirthday(birthDate) {
  if (!birthDate) return ''
  const [, m, d] = birthDate.split('-').map(Number)
  if (!m || !d || m < 1 || m > 12) return ''
  return `${d} ${MONTHS_GEN[m - 1]}`
}

// Принимаем и «@nick», и полную ссылку — храним голый ник.
export function normalizeHandle(value) {
  if (!value) return ''
  return value.trim()
    .replace(/^https?:\/\/(www\.)?(instagram\.com|t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
}

export const instagramUrl = (handle) => `https://instagram.com/${handle}`
export const telegramUrl = (handle) => `https://t.me/${handle}`
export const phoneUrl = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`

const hasAnyContact = (p) => Boolean(p && (p.name || parentPhones(p).length || p.instagram || p.telegram))

// Строки контактов для карточки. У клиентов, заведённых до этой формы,
// был один безымянный родитель в parentName/phone/email — показываем его как есть.
export function contactRows(client) {
  const rows = []
  const push = (role, icon, parent) => {
    if (hasAnyContact(parent)) rows.push({ role, icon, ...parent, phones: parentPhones(parent) })
  }
  push('Мама', '👩', client.mother)
  push('Папа', '👨', client.father)
  if (rows.length === 0 && (client.parentName || client.phone || client.email)) {
    rows.push({
      role: 'Родитель',
      icon: '👤',
      name: client.parentName || '',
      phones: client.phone ? [client.phone] : [],
      email: client.email || '',
      instagram: '',
      telegram: '',
    })
  }
  return rows
}

export function sourceInfo(client) {
  const known = SOURCES.find(s => s.value === client.source)
  if (!known) return null
  if (known.value === 'other') {
    return { ...known, label: client.sourceNote ? `Другое: ${client.sourceNote}` : known.label }
  }
  return known
}

export function genderInfo(client) {
  return GENDERS.find(g => g.value === client.gender) || null
}

export function searchText(client) {
  const parents = [client.mother, client.father, { name: client.parentName, phone: client.phone }]
  const parts = [client.childName, client.childContacts, client.notes, client.allergies, client.email]
  for (const p of parents) {
    if (!p) continue
    parts.push(p.name, p.instagram, p.telegram, ...parentPhones(p))
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

// Заполнение формы при редактировании: старого безымянного родителя
// подставляем в маму, чтобы данные не пришлось перебивать руками.
export function clientToForm(client) {
  const form = emptyClientForm()
  form.childName = client.childName || ''
  form.birthDate = client.birthDate || ''
  form.gender = client.gender || ''
  form.childContacts = client.childContacts || ''
  form.source = client.source || ''
  form.sourceNote = client.sourceNote || ''
  form.allergies = client.allergies || ''
  form.notes = client.notes || ''
  form.lessonPrice = Number.isFinite(client.lessonPrice) ? String(client.lessonPrice) : ''
  form.payerType = client.payerType || 'parent'
  form.legalEntityId = client.legalEntityId || ''

  // В форме всегда есть хотя бы одно поле для телефона, пусть и пустое.
  const toFormParent = (parent) => {
    const phones = parentPhones(parent)
    return { ...emptyParent(), ...parent, phones: phones.length ? phones : [''] }
  }

  if (hasAnyContact(client.mother) || hasAnyContact(client.father)) {
    form.mother = toFormParent(client.mother)
    form.father = toFormParent(client.father)
  } else if (client.parentName || client.phone) {
    form.mother = toFormParent({ name: client.parentName || '', phone: client.phone || '' })
  }
  return form
}

const cleanParent = (p) => ({
  name: p.name.trim(),
  phones: (p.phones || []).map(s => s.trim()).filter(Boolean).slice(0, MAX_PHONES),
  instagram: normalizeHandle(p.instagram),
  telegram: normalizeHandle(p.telegram),
})

export function formToDoc(form) {
  const price = form.lessonPrice === '' ? null : Number(form.lessonPrice)
  const isLegal = form.payerType === 'legal'
  return {
    childName: form.childName.trim(),
    birthDate: form.birthDate,
    gender: form.gender,
    childContacts: form.childContacts.trim(),
    mother: cleanParent(form.mother),
    father: cleanParent(form.father),
    source: form.source,
    sourceNote: form.source === 'other' ? form.sourceNote.trim() : '',
    allergies: form.allergies.trim(),
    notes: form.notes.trim(),
    lessonPrice: Number.isFinite(price) ? price : null,
    payerType: form.payerType,
    legalEntityId: isLegal ? form.legalEntityId : '',
  }
}

// Возвращает текст ошибки или null.
export function validateClientForm(form) {
  if (!form.childName.trim()) return 'Укажите ФИО ребёнка'
  if (!form.mother.name.trim() && !form.father.name.trim()) {
    return 'Укажите ФИО хотя бы одного родителя'
  }
  if (form.birthDate) {
    const birth = new Date(form.birthDate)
    if (Number.isNaN(birth.getTime())) return 'Некорректная дата рождения'
    if (birth > new Date()) return 'Дата рождения не может быть в будущем'
    if (calcAge(form.birthDate) === null) return 'Проверьте дату рождения'
  }
  if (form.lessonPrice !== '') {
    const price = Number(form.lessonPrice)
    if (!Number.isFinite(price) || price < 0) return 'Цена занятия — неотрицательное число'
  }
  if (form.payerType === 'legal' && !form.legalEntityId) {
    return 'Выберите юр. лицо или верните плательщика на родителей'
  }
  return null
}
