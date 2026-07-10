// Перенос истории из AlfaCRM. Здесь только преобразование данных —
// запись в Firestore в import-alfa-run.js, чтобы маппинг можно было
// прогнать на выгрузке без базы.
//
// Идентификаторы сохраняем: документ получает id вида `a<номер в AlfaCRM>`.
// Поэтому повторный импорт перезаписывает те же записи, а не плодит копии,
// и связи между уроками, учениками и деньгами не рвутся.

import { KIND_INCOME, KIND_EXPENSE, KIND_SALARY, KIND_REFUND } from './finance'

export const alfaId = (prefix, id) => `${prefix}${id}`

// AlfaCRM отдаёт даты как «дд.мм.гггг», иногда со временем.
export function parseAlfaDate(value) {
  if (!value) return null
  const [datePart] = String(value).split(' ')
  if (datePart.includes('-')) return new Date(`${datePart}T12:00:00`)
  const [d, m, y] = datePart.split('.')
  if (!y) return null
  const date = new Date(`${y}-${m}-${d}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export const toISODate = (value) => {
  const date = parseAlfaDate(value)
  return date ? date.toISOString().slice(0, 10) : ''
}

// Время урока приходит как «2026-07-05 11:00:01».
const timeOf = (value) => String(value || '').split(' ')[1]?.slice(0, 5) || ''

// --- Справочники -----------------------------------------------------------

// Тип операции в AlfaCRM: 1 доход, 7 расход, 8 выплата ЗП, 5 возврат.
const PAY_TYPE = {
  1: KIND_INCOME,
  7: KIND_EXPENSE,
  8: KIND_SALARY,
  5: KIND_REFUND,
}

export const payKind = (payTypeId) => PAY_TYPE[payTypeId] || null

// Статья принадлежит типу операции: у pay-item список pay_type_ids.
const itemKind = (item) => {
  for (const typeId of item.pay_type_ids || []) {
    if (PAY_TYPE[typeId]) return PAY_TYPE[typeId]
  }
  return KIND_EXPENSE
}

// Касса: наличные или карта. В AlfaCRM типа нет, определяем по названию.
const accountKind = (name) =>
  /карт|счет|счёт/i.test(String(name)) ? 'card' : 'cash'

const STATUS = { 1: 'active', 2: 'dropped', 3: 'dropped' }

const SOURCE = {
  6: 'instagram_ads',
  2: 'recommendation',
  1: 'other',
  3: 'other',
  4: 'other',
  5: 'other',
}

// Из «Самира мама @sshaykhova» достаём имя и ник телеграма.
export function splitPayer(legalName) {
  const raw = String(legalName || '').trim()
  if (!raw) return { name: '', telegram: '' }
  const match = raw.match(/@[\w.]+/)
  return {
    name: raw.replace(/@[\w.]+/, '').trim(),
    telegram: match ? match[0] : '',
  }
}

// --- Документы -------------------------------------------------------------

export const mapAccount = (row) => ({
  id: alfaId('a', row.id),
  data: { name: row.name, kind: accountKind(row.name), active: row.is_enabled !== 0 },
})

export const mapCategory = (row) => ({
  id: alfaId('a', row.id),
  data: { name: row.name, kind: itemKind(row), order: row.weight ?? 0, active: true },
})

export const mapTeacher = (row) => ({
  id: alfaId('a', row.id),
  data: {
    name: row.name,
    phone: (row.phone || [])[0] || '',
    telegram: '',
    rate: 0,
    active: true,
  },
})

export const mapPackage = (row) => ({
  id: alfaId('a', row.id),
  data: {
    name: row.name,
    lessonsCount: Number(row.lessons_count) || 0,
    price: Number(row.price) || 0,
    active: row.is_archive !== 1,
  },
})

export function mapClient(row) {
  const payer = splitPayer(row.legal_name)
  const phones = (row.phone || []).filter(Boolean)

  return {
    id: alfaId('a', row.id),
    data: {
      childName: row.name || 'Без имени',
      birthDate: toISODate(row.dob),
      gender: row.gender === 1 ? 'male' : row.gender === 0 ? 'female' : '',
      // Заказчик из AlfaCRM — тот, кто платит. Кладём его в «маму»:
      // отдельного поля заказчика у нас нет, а телефоны принадлежат ему.
      mother: { name: payer.name, phones: phones.length ? phones : [''], instagram: '', telegram: payer.telegram },
      father: { name: '', phones: [''], instagram: '', telegram: '' },
      childContacts: '',
      source: SOURCE[row.lead_source_id] || 'other',
      allergies: row.custom_allergiiosobennosti || '',
      notes: [row.note, row.custom_schoolname && `Школа: ${row.custom_schoolname}`]
        .filter(Boolean).join('\n'),
      payerType: 'parent',
      legalEntityId: '',
      status: row.is_study === 0 ? 'dropped' : (STATUS[row.study_status_id] || 'active'),
      sourceId: `customer/${row.id}`,
    },
  }
}

// День недели по ISO: 1 — понедельник, 7 — воскресенье. В AlfaCRM так же.
const isoWeekday = (isoDate) => {
  const day = new Date(`${isoDate}T12:00:00`).getDay()
  return day === 0 ? 7 : day
}

// Расписание группы. Если у неё есть регулярный урок — берём оттуда.
// Иначе выводим из фактических занятий: интенсив идёт днями подряд,
// обычная группа повторяется по одним и тем же дням недели.
export function groupSchedule(row, regular, groupLessons) {
  if (regular) {
    const days = regular.days?.length ? regular.days : [regular.day]
    return {
      mode: 'weekly',
      weekdays: days.filter(Number.isFinite).sort((a, b) => a - b),
      timeFrom: regular.time_from_v || '',
      timeTo: regular.time_to_v || '',
      dateFrom: toISODate(regular.b_date_v || row.b_date),
      dateTo: toISODate(regular.e_date_v || row.e_date),
    }
  }

  const dates = [...new Set(groupLessons.map(l => l.date))].sort()
  if (dates.length === 0) {
    return {
      mode: 'weekly', weekdays: [], timeFrom: '', timeTo: '',
      dateFrom: toISODate(row.b_date), dateTo: toISODate(row.e_date),
    }
  }

  const first = groupLessons.find(l => l.date === dates[0])
  const timeFrom = String(first?.time_from || '').split(' ')[1]?.slice(0, 5) || ''
  const timeTo = String(first?.time_to || '').split(' ')[1]?.slice(0, 5) || ''

  // Занятия каждый день подряд — это интенсив.
  const span = Math.round(
    (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) + 1
  const isRange = dates.length > 1 && span === dates.length

  return {
    mode: isRange ? 'range' : 'weekly',
    weekdays: isRange ? [] : [...new Set(dates.map(isoWeekday))].sort((a, b) => a - b),
    timeFrom,
    timeTo,
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
  }
}

export const mapGroup = (row, regular, groupLessons = []) => ({
  id: alfaId('a', row.id),
  data: {
    name: row.name,
    teacherId: row.teachers?.[0]?.id ? alfaId('a', row.teachers[0].id) : '',
    ...groupSchedule(row, regular, groupLessons),
    studentIds: [],
    archived: false,
    sourceId: `group/${row.id}`,
  },
})

const LESSON_STATUS = { 1: 'planned', 2: 'cancelled', 3: 'conducted' }
const LESSON_TYPE = { 1: 'individual', 2: 'group', 3: 'trial' }

export function mapLesson(row, groupNameById, clientNameById = {}) {
  const groupId = (row.group_ids || [])[0]
  const attendance = (row.details || []).map(detail => ({
    clientId: alfaId('a', detail.customer_id),
    clientName: clientNameById[detail.customer_id] || '',
    status: detail.is_attend === 1 ? 'present' : 'absent',
    amountCharged: Number(detail.commission) || 0,
    ...(detail.ctt_id > 0 ? { subscriptionId: alfaId('a', detail.ctt_id) } : {}),
  }))

  return {
    id: alfaId('a', row.id),
    data: {
      groupId: groupId ? alfaId('a', groupId) : null,
      groupName: groupId ? (groupNameById[groupId] || '') : '',
      date: row.date,
      timeFrom: timeOf(row.time_from),
      timeTo: timeOf(row.time_to),
      teacherId: (row.teacher_ids || [])[0] ? alfaId('a', row.teacher_ids[0]) : '',
      type: LESSON_TYPE[row.lesson_type_id] || 'group',
      topic: row.topic || '',
      status: LESSON_STATUS[row.status] || 'planned',
      studentIds: (row.customer_ids || []).map(id => alfaId('a', id)),
      attendance: row.status === 3 ? attendance : [],
      sourceId: `lesson/${row.id}`,
    },
  }
}

// Начисление за занятие. Создаётся по фактической сумме, даже если ученик
// не пришёл: пропуск без предупреждения тарифицируется.
export function mapCharges(lesson, clientNameById) {
  if (lesson.status !== 3) return []

  return (lesson.details || [])
    .filter(detail => Number(detail.commission) > 0)
    .map(detail => ({
      id: alfaId('a', detail.id),
      data: {
        clientId: alfaId('a', detail.customer_id),
        clientName: clientNameById[detail.customer_id] || '',
        amount: Number(detail.commission),
        lessons: 1,
        description: lesson.lesson_type_name || '',
        lessonId: alfaId('a', lesson.id),
        date: parseAlfaDate(lesson.date) || new Date(0),
        sourceId: `detail/${detail.id}`,
      },
    }))
}

export function mapTransaction(row, clientNameById, teacherNameById, fallbackCategory) {
  const kind = payKind(row.pay_type_id)
  if (!kind) return null

  const data = {
    kind,
    amount: Number(row.income) || 0,
    date: parseAlfaDate(row.document_date) || new Date(0),
    accountId: row.pay_account_id ? alfaId('a', row.pay_account_id) : '',
    // У возврата статьи в AlfaCRM нет — подставляем свою.
    categoryId: row.pay_item_id ? alfaId('a', row.pay_item_id) : fallbackCategory(kind),
    comment: row.note || '',
    sourceId: `pay/${row.id}`,
  }

  if (row.customer_id && (kind === KIND_INCOME || kind === KIND_REFUND)) {
    data.clientId = alfaId('a', row.customer_id)
    data.clientName = clientNameById[row.customer_id] || ''
  }
  if (row.payer_name) data.payerName = row.payer_name
  if (row.teacher_id) {
    data.teacherId = alfaId('a', row.teacher_id)
    data.teacherName = teacherNameById[row.teacher_id] || ''
  }
  return { id: alfaId('a', row.id), data }
}

// Абонемент задаёт цену занятия. Счётчика уроков нет: остаток считается из денег.
export function mapSubscription(row, tariffById) {
  const tariff = tariffById[row.tariff_id]
  if (!tariff) return null

  return {
    id: alfaId('a', row.id),
    data: {
      clientId: alfaId('a', row.customer_id),
      packageId: alfaId('a', row.tariff_id),
      name: tariff.name,
      lessonsTotal: Number(tariff.lessons_count) || 0,
      price: Number(tariff.price) || 0,
      startDate: toISODate(row.b_date),
      endDate: toISODate(row.e_date),
      status: 'active',
      sourceId: `customer-tariff/${row.id}`,
    },
  }
}

// --- План импорта ----------------------------------------------------------

export function planImport(dump) {
  const {
    customers = [], customersArchive = [], pays = [], groups = [], teachers = [],
    tariffs = [], customerTariffs = [], lessons = [], payAccounts = [], payItems = [],
    regularLessons = [],
  } = dump

  const allClients = [...customers, ...customersArchive]
  const clientNameById = Object.fromEntries(allClients.map(c => [c.id, c.name]))
  const teacherNameById = Object.fromEntries(teachers.map(t => [t.id, t.name]))
  const tariffById = Object.fromEntries(tariffs.map(t => [t.id, t]))
  const groupNameById = Object.fromEntries(groups.map(g => [g.id, g.name]))

  const categories = payItems.map(mapCategory)

  // Возврату в AlfaCRM статью не назначают — заводим свою.
  const REFUND_CATEGORY = { id: 'a-refund', data: { name: 'Возврат средств', kind: KIND_REFUND, order: 99, active: true } }
  categories.push(REFUND_CATEGORY)

  const byKind = (kind) => categories.find(c => c.data.kind === kind)?.id || ''
  const fallbackCategory = (kind) => kind === KIND_REFUND ? REFUND_CATEGORY.id : byKind(kind)

  const chargeDocs = []
  for (const lesson of lessons) chargeDocs.push(...mapCharges(lesson, clientNameById))

  const transactionDocs = pays
    .map(row => mapTransaction(row, clientNameById, teacherNameById, fallbackCategory))
    .filter(Boolean)

  // Состав группы AlfaCRM не отдаёт: собираем его из уроков.
  const studentsByGroup = {}
  const lessonsByGroup = {}
  for (const lesson of lessons) {
    const groupId = (lesson.group_ids || [])[0]
    if (!groupId) continue
    const set = studentsByGroup[groupId] ||= new Set()
    for (const clientId of lesson.customer_ids || []) set.add(alfaId('a', clientId))
    ;(lessonsByGroup[groupId] ||= []).push(lesson)
  }

  // Регулярный урок привязан к группе через related_id.
  const regularByGroup = {}
  for (const regular of regularLessons) {
    if (regular.related_class === 'Group') regularByGroup[regular.related_id] = regular
  }

  const groupDocs = groups.map(row => {
    const doc = mapGroup(row, regularByGroup[row.id], lessonsByGroup[row.id] || [])
    doc.data.studentIds = [...(studentsByGroup[row.id] || [])]
    return doc
  })

  return {
    accounts: payAccounts.map(mapAccount),
    categories,
    teachers: teachers.map(mapTeacher),
    packages: tariffs.map(mapPackage),
    clients: allClients.map(mapClient),
    groups: groupDocs,
    lessons: lessons.map(row => mapLesson(row, groupNameById, clientNameById)),
    charges: chargeDocs,
    transactions: transactionDocs,
    subscriptions: customerTariffs.map(row => mapSubscription(row, tariffById)).filter(Boolean),
    skipped: pays.filter(row => !payKind(row.pay_type_id))
      .map(row => ({ source: `pay/${row.id}`, reason: `тип «${row.pay_type_name}» не переносится` })),
  }
}

// --- Сверка ----------------------------------------------------------------

const sum = (list, pick = (x) => x.data.amount) => list.reduce((total, x) => total + (pick(x) || 0), 0)

// Балансы учеников после импорта обязаны совпасть с балансами AlfaCRM.
export function reconcileImport(dump, plan) {
  const allClients = [...(dump.customers || []), ...(dump.customersArchive || [])]

  const balances = new Map()
  const add = (clientId, delta) => {
    if (!clientId) return
    balances.set(clientId, (balances.get(clientId) || 0) + delta)
  }
  for (const t of plan.transactions) {
    if (t.data.kind === KIND_INCOME) add(t.data.clientId, t.data.amount)
    if (t.data.kind === KIND_REFUND) add(t.data.clientId, -t.data.amount)
  }
  for (const c of plan.charges) add(c.data.clientId, -c.data.amount)

  let matched = 0
  const mismatched = []
  for (const client of allClients) {
    const mine = balances.get(alfaId('a', client.id)) || 0
    const theirs = Number(client.balance || 0)
    if (Math.abs(mine - theirs) < 0.01) matched++
    else mismatched.push({ id: client.id, name: client.name, наш: mine, альфа: theirs })
  }

  const income = sum(plan.transactions.filter(t => t.data.kind === KIND_INCOME))
  const expected = (dump.pays || [])
    .filter(p => p.pay_type_id === 1)
    .reduce((s, p) => s + Number(p.income || 0), 0)

  return {
    clients: { total: allClients.length, matched, mismatched: mismatched.slice(0, 10) },
    income: { expected, actual: income, ok: Math.abs(income - expected) < 0.01 },
    charges: plan.charges.length,
    transactions: plan.transactions.length,
    ok: matched === allClients.length && Math.abs(income - expected) < 0.01,
  }
}
