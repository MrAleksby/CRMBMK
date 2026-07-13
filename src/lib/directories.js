// Описание справочников. Новый справочник = новый элемент этого массива,
// отдельный компонент писать не нужно — DirectoryTable читает описание.

export const FIELD_TEXT = 'text'
export const FIELD_AMOUNT = 'amount'
export const FIELD_COUNT = 'count'
export const FIELD_SELECT = 'select'
export const FIELD_HANDLE = 'handle'

// Типы операций. «Выплата ЗП» и «Возврат клиенту» стоят отдельно от расходов —
// так же, как в AlfaCRM, где это самостоятельные типы документа.
export const CATEGORY_KINDS = [
  { value: 'income', label: 'Доход' },
  { value: 'expense', label: 'Расход' },
  { value: 'salary', label: 'Выплата ЗП' },
  { value: 'refund', label: 'Возврат клиенту' },
  { value: 'draw', label: 'Изъятие' },
]

// Статьи изъятий: на что владелец забрал деньги. Прибыль они не трогают (изъятие
// есть изъятие), но по ним видно структуру личных трат — как по расходам школы.
// «Прочее» стоит последним: это ящик для того, что не разложилось.
export const DRAW_CATEGORY_NAMES = [
  'Продукты', 'Питание', 'Такси', 'Подарки', 'Быт и ремонт', 'Прочее',
]

// Порядок внутри типа — как перечислил владелец, поэтому фиксируем его полем order.
const CATEGORY_SEED = [
  { name: 'Оплата за занятие', kind: 'income' },
  { name: 'Доп услуги', kind: 'income' },
  { name: 'Кешбеки', kind: 'income' },
  { name: 'Турнир', kind: 'income' },

  { name: 'Налог 1%', kind: 'expense' },
  { name: 'Питание', kind: 'expense' },
  { name: 'Банковские расходы', kind: 'expense' },
  { name: 'Такси', kind: 'expense' },
  { name: 'Аренда', kind: 'expense' },
  { name: 'Коммунальные', kind: 'expense' },
  { name: 'Материалы', kind: 'expense' },
  { name: 'Операционные', kind: 'expense' },
  { name: 'Призы', kind: 'expense' },
  { name: 'Сотрудники', kind: 'expense' },

  { name: 'Зарплата тренера', kind: 'salary' },
  { name: 'Процент менеджера', kind: 'salary' },
  { name: 'Аутсорс', kind: 'salary' },

  { name: 'Возврат средств', kind: 'refund' },

  ...DRAW_CATEGORY_NAMES.map(name => ({ name, kind: 'draw' })),
].map((row, index) => ({ ...row, order: index }))

// Роль сотрудника. Зарплату получают все, уроки ведут только педагоги.
// Записи без роли — педагоги: справочник заводился, когда менеджеров в нём не было.
// iconName и color рисуются в колонке «Роль»: в таблице из десятка строк педагога
// от менеджера видно раньше, чем прочитано слово.
export const STAFF_ROLES = [
  { value: 'teacher', label: 'Педагог', iconName: 'teacher', color: '#7c3aed' },
  { value: 'manager', label: 'Менеджер', iconName: 'userCheck', color: '#2563eb' },
  { value: 'other', label: 'Другое', iconName: 'clients', color: '#6b7280' },
]

export const isTeacher = (staff) => (staff?.role || 'teacher') === 'teacher'

export const staffRoleLabel = (staff) =>
  STAFF_ROLES.find(r => r.value === (staff?.role || 'teacher'))?.label ?? ''

export const DIRECTORIES = [
  {
    key: 'teachers',
    label: 'Сотрудники',
    iconName: 'teacher',
    itemName: 'сотрудника',
    hint: 'Педагоги ведут уроки. Менеджерам и аутсорсу можно провести выплату ЗП, ' +
      'но в занятия они не попадают.',
    fields: [
      { key: 'name', label: 'ФИО', type: FIELD_TEXT, required: true },
      {
        key: 'role', label: 'Роль', type: FIELD_SELECT, required: true,
        options: STAFF_ROLES, fallback: 'teacher',
      },
      { key: 'phone', label: 'Телефон', type: FIELD_TEXT },
      { key: 'telegram', label: 'Telegram', type: FIELD_HANDLE, placeholder: '@nickname' },
      { key: 'rate', label: 'Ставка за урок (сум)', type: FIELD_AMOUNT },
    ],
    columns: ['name', 'role', 'phone', 'telegram', 'rate'],
  },
  {
    key: 'packages',
    label: 'Абонементы',
    iconName: 'ticket',
    itemName: 'абонемент',
    hint: 'Пакет уроков. Цена за занятие подставится в журнал автоматически, но её можно изменить.',
    fields: [
      { key: 'name', label: 'Название', type: FIELD_TEXT, required: true, placeholder: 'Пакет 8' },
      { key: 'lessonsCount', label: 'Уроков в пакете', type: FIELD_COUNT, required: true, min: 1 },
      { key: 'price', label: 'Стоимость пакета (сум)', type: FIELD_AMOUNT, required: true },
    ],
    columns: ['name', 'lessonsCount', 'price', 'perLesson'],
  },
  {
    key: 'accounts',
    label: 'Кассы',
    iconName: 'finance',
    itemName: 'кассу',
    hint: 'Порядок задаёт, как кассы идут в отчёте по остаткам. Меньше число — выше строка.',
    // Порядок кассы задан вручную: в отчёте она должна стоять там, где привык владелец,
    // а не там, куда её поставит алфавит.
    sortBy: ['order'],
    fields: [
      { key: 'name', label: 'Название', type: FIELD_TEXT, required: true, placeholder: 'Наличные' },
      {
        key: 'kind', label: 'Тип', type: FIELD_SELECT, required: true,
        options: [
          { value: 'cash', label: 'Наличные' },
          { value: 'card', label: 'Карта' },
        ],
      },
      { key: 'order', label: 'Порядок в отчёте', type: FIELD_COUNT, min: 0 },
    ],
    columns: ['name', 'kind', 'order'],
    seed: [
      { name: 'Наличные', kind: 'cash' },
      { name: 'Карта', kind: 'card' },
    ],
  },
  {
    key: 'categories',
    label: 'Статьи',
    iconName: 'list',
    itemName: 'статью',
    hint: 'Статьи доходов и расходов. «Выплата ЗП» — отдельный тип операции, как в AlfaCRM. ' +
      'Налог 1% вносится вручную как расход.',
    fields: [
      { key: 'name', label: 'Название', type: FIELD_TEXT, required: true },
      {
        key: 'kind', label: 'Тип', type: FIELD_SELECT, required: true,
        options: CATEGORY_KINDS,
      },
    ],
    columns: ['name', 'kind'],
    // Порядок задан вручную и сохраняется в поле order: сначала доходы, затем расходы,
    // затем зарплаты. Алфавит здесь только мешал бы.
    sortBy: ['kind', 'order'],
    seed: CATEGORY_SEED,
  },
  {
    key: 'legalEntities',
    label: 'Юр. лица',
    iconName: 'archive',
    itemName: 'юр. лицо',
    hint: 'Организации, которые платят за учеников вместо родителей.',
    fields: [
      { key: 'name', label: 'Название', type: FIELD_TEXT, required: true },
      { key: 'contactName', label: 'Контактное лицо', type: FIELD_TEXT },
      { key: 'phone', label: 'Телефон', type: FIELD_TEXT },
      { key: 'note', label: 'Примечание', type: FIELD_TEXT },
    ],
    columns: ['name', 'contactName', 'phone'],
  },
]

export const getDirectory = (key) => DIRECTORIES.find(d => d.key === key)

const KIND_RANK = Object.fromEntries(CATEGORY_KINDS.map((k, i) => [k.value, i]))

const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru')

const byOrder = (a, b) => {
  const orderA = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER
  const orderB = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER
  return orderA !== orderB ? orderA - orderB : byName(a, b)
}

// Справочники сортируются по алфавиту, кроме тех, где порядок задал владелец:
// статьи (сначала доходы, потом расходы, потом зарплаты) и кассы (по важности).
// Порядок хранится в поле order, записи без него уходят в конец.
export function sortItems(dir, items) {
  const list = [...items]
  const sortBy = dir.sortBy?.[0]

  if (sortBy === 'order') return list.sort(byOrder)
  if (sortBy !== 'kind') return list.sort(byName)

  return list.sort((a, b) => {
    const kindA = KIND_RANK[a.kind] ?? 99
    const kindB = KIND_RANK[b.kind] ?? 99
    if (kindA !== kindB) return kindA - kindB
    return byOrder(a, b)
  })
}

// Новая запись встаёт в конец своей группы, а не в середину чужого порядка.
// Без kind порядок сквозной по всему справочнику — так устроены кассы.
export function nextOrder(items, kind) {
  const orders = items
    .filter(i => (kind === undefined || i.kind === kind) && Number.isFinite(i.order))
    .map(i => i.order)
  return orders.length ? Math.max(...orders) + 1 : 0
}

// Цена одного занятия по тарифу. Именно она подставляется в журнал.
export function perLessonPrice(pkg) {
  const count = Number(pkg?.lessonsCount)
  const price = Number(pkg?.price)
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(price)) return null
  return Math.round(price / count)
}

export const emptyItem = (dir) =>
  Object.fromEntries(dir.fields.map(f => [
    f.key,
    f.type === FIELD_SELECT ? (f.options[0]?.value ?? '') : '',
  ]))

// fallback нужен полям, добавленным к уже заполненному справочнику:
// у старых записей значения нет, но смысл у него есть (сотрудник без роли — педагог).
export function optionLabel(field, value) {
  const actual = value || field.fallback
  return field.options?.find(o => o.value === actual)?.label ?? actual ?? '—'
}
