// Описание справочников. Новый справочник = новый элемент этого массива,
// отдельный компонент писать не нужно — DirectoryTable читает описание.

export const FIELD_TEXT = 'text'
export const FIELD_AMOUNT = 'amount'
export const FIELD_COUNT = 'count'
export const FIELD_SELECT = 'select'
export const FIELD_HANDLE = 'handle'

export const DIRECTORIES = [
  {
    key: 'teachers',
    label: 'Педагоги',
    icon: '🎓',
    itemName: 'педагога',
    fields: [
      { key: 'name', label: 'ФИО', type: FIELD_TEXT, required: true },
      { key: 'phone', label: 'Телефон', type: FIELD_TEXT },
      { key: 'telegram', label: 'Telegram', type: FIELD_HANDLE, placeholder: '@nickname' },
      { key: 'rate', label: 'Ставка за урок (сум)', type: FIELD_AMOUNT },
    ],
    columns: ['name', 'phone', 'telegram', 'rate'],
  },
  {
    key: 'subjects',
    label: 'Предметы',
    icon: '📚',
    itemName: 'предмет',
    fields: [
      { key: 'name', label: 'Название', type: FIELD_TEXT, required: true },
      { key: 'note', label: 'Примечание', type: FIELD_TEXT },
    ],
    columns: ['name', 'note'],
    seed: [{ name: 'Финансовая грамотность', note: '' }],
  },
  {
    key: 'packages',
    label: 'Тарифы',
    icon: '🎫',
    itemName: 'тариф',
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
    icon: '🏦',
    itemName: 'кассу',
    fields: [
      { key: 'name', label: 'Название', type: FIELD_TEXT, required: true, placeholder: 'Наличные' },
      {
        key: 'kind', label: 'Тип', type: FIELD_SELECT, required: true,
        options: [
          { value: 'cash', label: '💵 Наличные' },
          { value: 'card', label: '💳 Карта' },
        ],
      },
    ],
    columns: ['name', 'kind'],
    seed: [
      { name: 'Наличные', kind: 'cash' },
      { name: 'Карта', kind: 'card' },
    ],
  },
  {
    key: 'categories',
    label: 'Статьи',
    icon: '🏷️',
    itemName: 'статью',
    hint: 'Статьи доходов и расходов. Налог 1% ИП вносится вручную как расход.',
    fields: [
      { key: 'name', label: 'Название', type: FIELD_TEXT, required: true },
      {
        key: 'kind', label: 'Тип', type: FIELD_SELECT, required: true,
        options: [
          { value: 'income', label: '📈 Доход' },
          { value: 'expense', label: '📉 Расход' },
        ],
      },
    ],
    columns: ['name', 'kind'],
    seed: [
      { name: 'Оплата за занятие', kind: 'income' },
      { name: 'Доп услуги', kind: 'income' },
      { name: 'Налог 1% ИП', kind: 'expense' },
      { name: 'Зарплата тренера', kind: 'expense' },
      { name: 'Аренда', kind: 'expense' },
      { name: 'Реклама', kind: 'expense' },
      { name: 'Инвентарь', kind: 'expense' },
      { name: 'Коммунальные', kind: 'expense' },
      { name: 'Прочее', kind: 'expense' },
    ],
  },
  {
    key: 'legalEntities',
    label: 'Юр. лица',
    icon: '🏛️',
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

export function optionLabel(field, value) {
  return field.options?.find(o => o.value === value)?.label ?? value ?? '—'
}
