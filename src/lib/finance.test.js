import { describe, it, expect } from 'vitest'
import {
  companyBalance, accountTotals, incomeTotal, expenseTotal, salaryTotal, refundTotal,
  periodProfit, toJsDate, inPeriod,
} from './finance'

// Главный инвариант всей системы: сумма остатков по кассам = баланс компании.
// Если он ломается, врут все финансовые экраны разом.

const tx = (kind, amount, accountId = 'cash', over = {}) => ({
  kind, amount, accountId, date: new Date('2026-07-01'), ...over,
})

describe('баланс компании', () => {
  it('доходы минус расходы, зарплаты и возвраты', () => {
    const list = [
      tx('income', 1_000_000),
      tx('expense', 200_000),
      tx('salary', 300_000),
      tx('refund', 100_000),
    ]
    expect(companyBalance(list)).toBe(400_000)
  })

  it('ИНВАРИАНТ: сумма остатков по кассам равна балансу компании', () => {
    const accounts = [{ id: 'cash', name: 'Наличные' }, { id: 'card', name: 'Карта' }]
    const list = [
      tx('income', 5_000_000, 'cash'),
      tx('income', 3_000_000, 'card'),
      tx('expense', 1_200_000, 'cash'),
      tx('salary', 2_000_000, 'card'),
      tx('refund', 300_000, 'cash'),
    ]

    const byAccount = accountTotals(list, accounts)
    const sum = byAccount.reduce((total, a) => total + a.total, 0)

    expect(sum).toBe(companyBalance(list))
    expect(sum).toBe(4_500_000)
  })

  it('касса с одними расходами уходит в минус', () => {
    const accounts = [{ id: 'cash', name: 'Наличные' }]
    const [cash] = accountTotals([tx('expense', 100_000, 'cash')], accounts)
    expect(cash.total).toBe(-100_000)
  })
})

describe('итоги по видам операций', () => {
  const list = [tx('income', 100), tx('income', 50), tx('expense', 30), tx('salary', 20), tx('refund', 10)]

  it('считает каждый вид отдельно', () => {
    expect(incomeTotal(list)).toBe(150)
    expect(expenseTotal(list)).toBe(30)
    expect(salaryTotal(list)).toBe(20)
    expect(refundTotal(list)).toBe(10)
  })

  it('прибыль за период = баланс операций периода', () => {
    expect(periodProfit(list)).toBe(90)
  })
})

describe('toJsDate — даты приходят в трёх видах', () => {
  it('Timestamp из Firestore', () => {
    const stamp = { seconds: 1_783_753_200, nanoseconds: 0 }
    expect(toJsDate(stamp)).toBeInstanceOf(Date)
  })

  it('объект с toDate()', () => {
    const date = new Date('2026-07-01')
    expect(toJsDate({ toDate: () => date })).toBe(date)
  })

  it('строка YYYY-MM-DD — не съезжает на день назад из-за часового пояса', () => {
    const date = toJsDate('2026-07-05')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(6)
    expect(date.getDate()).toBe(5)
  })

  it('мусор — null, а не падение', () => {
    expect(toJsDate(null)).toBe(null)
    expect(toJsDate('не дата')).toBe(null)
    expect(toJsDate({})).toBe(null)
  })
})

describe('inPeriod — фильтр по месяцу и году', () => {
  const item = { date: new Date('2026-07-05T12:00:00') }

  it('свой месяц', () => {
    expect(inPeriod(item, 6, 2026)).toBe(true)
  })

  it('чужой месяц', () => {
    expect(inPeriod(item, 5, 2026)).toBe(false)
  })

  // «Все месяцы» — это весь выбранный год, а не «за всё время». Раньше год молча
  // отменялся, и в финансах при выбранном 2026 в метрики попадал декабрь 2025.
  it('«все месяцы» — весь выбранный год', () => {
    expect(inPeriod(item, 'all', 2026)).toBe(true)
    expect(inPeriod(item, 'all', 2025)).toBe(false)
  })

  it('«все годы» снимают ограничение по году', () => {
    expect(inPeriod(item, 'all', 'all')).toBe(true)
    expect(inPeriod(item, 6, 'all')).toBe(true)
    expect(inPeriod(item, 5, 'all')).toBe(false)
  })

  it('год-строка из <select> понимается как число', () => {
    expect(inPeriod(item, 'all', '2026')).toBe(true)
    expect(inPeriod(item, 'all', '2025')).toBe(false)
  })

  it('запись без даты в период не попадает', () => {
    expect(inPeriod({}, 'all', 'all')).toBe(false)
  })
})
