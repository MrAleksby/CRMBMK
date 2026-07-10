// Разовый перенос старой финансовой модели в новую.
//
//   payments (type: 'income')  → transactions (kind: 'income')
//   payments (type: 'session') → charges
//   expenses                   → transactions (kind: 'expense' | 'salary')
//
// Старые коллекции не трогаем: пока суммы не сверены, они — единственная копия.
// Повторный запуск безопасен: каждая перенесённая запись помнит источник
// в поле sourceId, и второй раз её не создадут.

// Здесь только расчёты: план переноса и сверка сумм. Запись в Firestore —
// в migrate-run.js, чтобы эту логику можно было прогнать без базы.

import { KIND_INCOME, KIND_EXPENSE, KIND_SALARY, toJsDate } from './finance'

// Статья дохода для всех старых платежей: других в прежней модели не было.
const INCOME_CATEGORY = 'Оплата за занятие'

// Расходы хранили категорию строкой. Сопоставляем со статьями справочника.
// Названия, которых там нет, мигратор создаст сам — терять историю нельзя.
const EXPENSE_CATEGORY = {
  rent: { name: 'Аренда', kind: KIND_EXPENSE },
  utils: { name: 'Коммунальные', kind: KIND_EXPENSE },
  supplies: { name: 'Материалы', kind: KIND_EXPENSE },
  other: { name: 'Операционные', kind: KIND_EXPENSE },
  ads: { name: 'Реклама', kind: KIND_EXPENSE },
  // Зарплата в старой модели была категорией расхода. В новой это
  // самостоятельный тип операции — так же, как в AlfaCRM.
  salary: { name: 'Зарплата тренера', kind: KIND_SALARY },
}

const FALLBACK = { name: 'Операционные', kind: KIND_EXPENSE }

const normalize = (name) => String(name || '').trim().toLowerCase()

// Дата обязана быть Timestamp: правила Firestore это проверяют.
// У битых записей даты может не быть — ставим начало эпохи, чтобы не потерять сумму.
const safeDate = (value) => toJsDate(value) || new Date(0)

// Что нужно создать в справочнике статей, чтобы миграции было куда ссылаться.
export function missingCategories(expenses, categories) {
  const existing = new Set(categories.map(c => normalize(c.name)))
  const needed = new Map()

  const want = (spec) => {
    if (existing.has(normalize(spec.name)) || needed.has(normalize(spec.name))) return
    needed.set(normalize(spec.name), spec)
  }

  if (expenses.length === 0 && needed.size === 0) { /* нечего добавлять */ }
  for (const expense of expenses) {
    want(EXPENSE_CATEGORY[expense.category] || FALLBACK)
  }
  return [...needed.values()]
}

export function incomeCategoryMissing(payments, categories) {
  const hasIncome = payments.some(p => p.type === 'income')
  const existing = new Set(categories.map(c => normalize(c.name)))
  return hasIncome && !existing.has(normalize(INCOME_CATEGORY))
    ? [{ name: INCOME_CATEGORY, kind: KIND_INCOME }]
    : []
}

// План переноса. accountId — касса, куда отнести всю историю: у старых
// записей кассы не было, а без неё операция не пройдёт валидацию.
export function planMigration({ payments, expenses, categories, accountId, done }) {
  const byName = new Map(categories.map(c => [normalize(c.name), c]))
  const already = new Set(done)

  const categoryId = (spec) => byName.get(normalize(spec.name))?.id || ''

  const transactions = []
  const charges = []
  const skipped = []

  for (const payment of payments) {
    const source = `payments/${payment.id}`
    if (already.has(source)) continue

    if (payment.type === 'income') {
      const id = categoryId({ name: INCOME_CATEGORY })
      if (!id) { skipped.push({ source, reason: 'нет статьи «Оплата за занятие»' }); continue }
      transactions.push({
        kind: KIND_INCOME,
        amount: payment.amount || 0,
        date: safeDate(payment.date),
        accountId,
        categoryId: id,
        clientId: payment.clientId || '',
        clientName: payment.clientName || '',
        comment: payment.description || '',
        sourceId: source,
      })
    } else {
      // Списание за занятие деньгами не было — это начисление на лицевой счёт.
      if (!payment.clientId) { skipped.push({ source, reason: 'списание без ученика' }); continue }
      charges.push({
        clientId: payment.clientId,
        clientName: payment.clientName || '',
        amount: payment.amount || 0,
        lessons: payment.sessions || 1,
        date: safeDate(payment.date),
        description: payment.description || '',
        ...(payment.lessonId ? { lessonId: payment.lessonId } : {}),
        sourceId: source,
      })
    }
  }

  for (const expense of expenses) {
    const source = `expenses/${expense.id}`
    if (already.has(source)) continue

    const spec = EXPENSE_CATEGORY[expense.category] || FALLBACK
    const id = categoryId(spec)
    if (!id) { skipped.push({ source, reason: `нет статьи «${spec.name}»` }); continue }

    transactions.push({
      kind: spec.kind,
      amount: expense.amount || 0,
      date: safeDate(expense.date),
      accountId,
      categoryId: id,
      comment: expense.description || '',
      sourceId: source,
    })
  }

  return { transactions, charges, skipped }
}

const sum = (list) => list.reduce((total, item) => total + (item.amount || 0), 0)

// Сверка: сумма денег до и после переноса должна совпасть до копейки.
//
// «После» считаем только по записям с sourceId — операции, заведённые руками
// уже в новой модели, к старым суммам отношения не имеют. Иначе повторный
// запуск сверки ругался бы на каждый новый платёж.
export function reconcile({ payments, expenses }, { transactions, charges }) {
  const migrated = transactions.filter(t => t.sourceId)
  const migratedCharges = charges.filter(c => c.sourceId)

  const before = {
    income: sum(payments.filter(p => p.type === 'income')),
    sessions: sum(payments.filter(p => p.type === 'session')),
    expenses: sum(expenses),
  }
  const after = {
    income: sum(migrated.filter(t => t.kind === KIND_INCOME)),
    sessions: sum(migratedCharges),
    expenses: sum(migrated.filter(t => t.kind !== KIND_INCOME)),
  }
  return {
    before,
    after,
    ok: before.income === after.income
      && before.sessions === after.sessions
      && before.expenses === after.expenses,
  }
}
