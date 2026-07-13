// Справочники и хелперы для карточки клиента.

export const GENDERS = [
  { value: 'male', label: 'Мальчик', iconName: 'boy' },
  { value: 'female', label: 'Девочка', iconName: 'girl' },
]

// `iconName` — имя линейной иконки (src/components/Icon.jsx).
export const SOURCES = [
  { value: 'instagram_ads', label: 'Реклама в Instagram', iconName: 'instagram' },
  { value: 'telegram_ads', label: 'Реклама в Telegram', iconName: 'telegram' },
  { value: 'recommendation', label: 'По рекомендации', iconName: 'recommend' },
  { value: 'other', label: 'Другое', iconName: 'help' },
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
  { value: 'parent', label: 'Родители' },
  { value: 'legal', label: 'Юр. лицо' },
]

// Статус обучения, как в AlfaCRM. Статус «лид» — техническая основа карточки
// лида: у такой записи есть карточка ученика (пробные, оплаты), но в списке
// «Клиенты» её не показываем. «Сделать клиентом» = сменить статус на «активен».
export const CLIENT_STATUSES = [
  { value: 'active', label: 'Активен', color: '#059669', background: '#dcfce7' },
  { value: 'paused', label: 'Пауза', color: '#b45309', background: '#fef3c7' },
  { value: 'dropped', label: 'Бросил', color: '#6b7280', background: '#f3f4f6' },
  { value: 'lead', label: 'Лид', color: '#7c3aed', background: '#ede9fe' },
]

// Лид держит карточку ученика, но клиентом ещё не стал.
export const isLeadClient = (client) => (client?.status || 'active') === 'lead'

export const STATUS_DROPPED = 'dropped'

// Можно ли удалять ученика.
//
// Удаление стирает и его оплаты — а деньги реально были получены и лежали
// в кассе. Стерев их, мы задним числом уменьшим доходы, баланс компании
// и остаток кассы за уже закрытые месяцы: отчёты поедут.
//
// Поэтому ученика с историей удалять нельзя вообще — его переводят в статус
// «Бросил»: из рабочего списка уходит, прошлое остаётся нетронутым.
// Удаление живёт только для мусора: дубль, ошибка ввода, тестовая запись.
export function clientHistory(clientId, { transactions = [], charges = [], lessons = [] }) {
  const paid = transactions.filter(t => t.clientId === clientId && t.kind === 'income')
  const charged = charges.filter(c => c.clientId === clientId)
  const attended = lessons.filter(l =>
    l.status === 'conducted' && (l.studentIds || []).includes(clientId))

  return {
    payments: paid.length,
    paidTotal: paid.reduce((s, t) => s + (t.amount || 0), 0),
    charges: charged.length,
    lessons: attended.length,
    // Пустая карточка — ни денег, ни проведённых занятий. Только её и удаляем.
    isEmpty: paid.length === 0 && charged.length === 0 && attended.length === 0,
  }
}

// Человеческое объяснение, почему удалять нельзя.
export function whyKeepClient(client, history) {
  const parts = []
  if (history.lessons) parts.push(`проведённых занятий: ${history.lessons}`)
  if (history.payments) parts.push(`оплат: ${history.payments} на ${history.paidTotal.toLocaleString('ru')} сум`)
  if (history.charges && !history.lessons) parts.push(`списаний: ${history.charges}`)
  return `У ученика «${client.childName}» есть история — ${parts.join(', ')}.\n\n`
    + 'Удаление стёрло бы и его оплаты, а деньги реально были в кассе: доходы, '
    + 'баланс компании и остатки по кассам за прошлые месяцы изменились бы задним числом.\n\n'
    + 'Переведите его в статус «Бросил» — он уйдёт из рабочего списка, а история сохранится.'
}

export const statusInfo = (client) =>
  CLIENT_STATUSES.find(s => s.value === (client.status || 'active')) ?? CLIENT_STATUSES[0]

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
  status: 'active',
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

// Склонение: «1 урок», «2 урока», «5 уроков». Без него в карточке
// выходило «3 уроков» и «1 занятий».
export function plural(count, one, few, many) {
  const lastTwo = Math.abs(count) % 100
  const last = Math.abs(count) % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} ${many}`
  if (last === 1) return `${count} ${one}`
  if (last >= 2 && last <= 4) return `${count} ${few}`
  return `${count} ${many}`
}

export const lessonsLabel = (count) => plural(count, 'урок', 'урока', 'уроков')
export const classesLabel = (count) => plural(count, 'занятие', 'занятия', 'занятий')

// Дата рождения целиком, с годом: «4 сентября 2015». Год нужен —
// по нему сверяют ребёнка с документами и считают возраст.
export function formatBirthday(birthDate) {
  if (!birthDate) return ''
  const [y, m, d] = birthDate.split('-').map(Number)
  if (!m || !d || m < 1 || m > 12) return ''
  const day = `${d} ${MONTHS_GEN[m - 1]}`
  return y ? `${day} ${y}` : day
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

// Как подписать контакт: «Самира мама», «Мама» (если имени нет), «Дилноза папа».
//
// В выгрузке из AlfaCRM роль часто уже вписана в само имя — «Самира мама».
// Дописывать её механически нельзя: получалось «Самира мама мама».
export function contactTitle(row) {
  const name = (row?.name || '').trim()
  const role = (row?.role || '').trim()
  if (!name) return role
  if (!role) return name
  return name.toLowerCase().includes(role.toLowerCase()) ? name : `${name} ${role.toLowerCase()}`
}

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

// Сортировка списка учеников по колонке таблицы. Баланс приходит извне:
// он считается одним проходом по всем операциям и в клиенте не хранится.
//
// Статус сортируется по смыслу — активен, пауза, бросил, — а не по алфавиту:
// «Активен» и «Бросил» рядом в словаре, но противоположны по делу.
export function sortClients(list, key, direction, { balance = () => 0 } = {}) {
  const sign = direction === 'desc' ? -1 : 1

  const value = (client) => {
    switch (key) {
      case 'name': return client.childName || ''
      case 'balance': return balance(client.id)
      case 'status': return CLIENT_STATUSES.findIndex(s => s.value === (client.status || 'active'))
      case 'contacts': {
        const [first] = contactRows(client)
        return first ? (parentPhones(first)[0] || first.name || '') : ''
      }
      case 'notes': return client.notes || ''
      default: return 0
    }
  }

  return [...list].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    if (typeof left === 'number' && typeof right === 'number') return sign * (left - right)
    return sign * String(left).localeCompare(String(right), 'ru')
  })
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
  form.status = client.status || 'active'

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
    status: form.status,
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
