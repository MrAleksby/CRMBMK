import { describe, it, expect } from 'vitest'
import {
  companyBalance, accountTotals, incomeTotal, expenseTotal, salaryTotal, refundTotal,
  drawTotal, periodCashFlow, realizedProfit, otherIncomeTotal, toJsDate, inPeriod,
  KIND_DRAW, KIND_TRANSFER,
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

  it('денежный поток = баланс операций периода', () => {
    expect(periodCashFlow(list)).toBe(90)
  })
})

describe('realizedProfit — прибыль считается по работе, а не по деньгам', () => {
  // Оплата ученика денег в прибыль не приносит: её приносит проведённое занятие.
  // Иначе месяц с крупной предоплатой показал бы прибыль, которой не заработали.
  const transactions = [
    { kind: 'income', amount: 1_000_000, clientId: 'a' },   // абонемент на будущее
    { kind: 'income', amount: 300_000 },                     // турнир — ученика нет
    { kind: 'expense', amount: 200_000 },
    { kind: 'salary', amount: 100_000 },
    { kind: 'draw', amount: 500_000 },
  ]
  const charges = [{ clientId: 'a', amount: 400_000 }]

  it('доход без ученика — это доход компании', () => {
    expect(otherIncomeTotal(transactions)).toBe(300_000)
  })

  it('прибыль = списано + доходы вне занятий − расходы − ЗП', () => {
    expect(realizedProfit(transactions, charges))
      .toBe(400_000 + 300_000 - 200_000 - 100_000)
  })

  it('изъятие владельца прибыль не уменьшает', () => {
    const withoutDraw = transactions.filter(t => t.kind !== 'draw')
    expect(realizedProfit(transactions, charges)).toBe(realizedProfit(withoutDraw, charges))
  })

  it('оплата ученика сама по себе прибыли не даёт — только проведённое занятие', () => {
    expect(realizedProfit(transactions, [])).toBe(300_000 - 200_000 - 100_000)
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

// Изъятие владельца: деньги ушли из кассы, но школа их не тратила — она их заработала,
// а владелец забрал. Поэтому касса уменьшается, а прибыль нет.
describe('изъятие владельца', () => {
  const list = [
    tx('income', 1_000_000),
    tx('expense', 200_000),
    tx('salary', 300_000),
    tx(KIND_DRAW, 400_000),
  ]
  const charges = [{ clientId: 'a', amount: 900_000 }]

  it('касса уменьшается на изъятие', () => {
    expect(companyBalance(list)).toBe(1_000_000 - 200_000 - 300_000 - 400_000)
  })

  it('прибыль изъятием не уменьшается', () => {
    const withoutDraw = list.filter(t => t.kind !== KIND_DRAW)
    expect(realizedProfit(list, charges)).toBe(realizedProfit(withoutDraw, charges))
  })

  it('изъятие не считается зарплатой', () => {
    expect(salaryTotal(list)).toBe(300_000)
    expect(drawTotal(list)).toBe(400_000)
  })
})

// Перевод между кассами: деньги остались внутри компании, сменился только карман.
// Ни доход, ни расход, ни прибыль, ни баланс — только остатки двух касс.
describe('перевод между кассами', () => {
  const accounts = [{ id: 'rs', name: 'Расчётный счёт' }, { id: 'card', name: 'Карта' }]
  const transfer = [{
    kind: KIND_TRANSFER, amount: 1_000_000, accountId: 'rs', accountToId: 'card',
    date: new Date('2026-05-04'),
  }]

  it('не доход и не расход', () => {
    expect(incomeTotal(transfer)).toBe(0)
    expect(expenseTotal(transfer)).toBe(0)
  })

  it('баланс компании не меняет: деньги остались внутри', () => {
    expect(companyBalance(transfer)).toBe(0)
  })

  it('двигает обе кассы: из одной ушло, в другую пришло', () => {
    const totals = accountTotals(transfer, accounts)
    expect(totals.find(a => a.id === 'rs').total).toBe(-1_000_000)
    expect(totals.find(a => a.id === 'card').total).toBe(1_000_000)
  })

  it('ИНВАРИАНТ держится и с переводом: сумма касс = баланс компании', () => {
    const list = [...transfer, tx('income', 500_000, 'card'), tx('expense', 200_000, 'rs')]
    const sum = accountTotals(list, accounts).reduce((total, a) => total + a.total, 0)
    expect(sum).toBe(companyBalance(list))
  })

  it('в прибыль не входит', () => {
    const charges = [{ clientId: 'a', amount: 300_000 }]
    expect(realizedProfit(transfer, charges)).toBe(300_000)
  })
})
