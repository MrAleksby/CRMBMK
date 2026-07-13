import { describe, it, expect } from 'vitest'
import { transferPairs, toTransferDoc, pairsSum } from './transfers.js'
import { KIND_TRANSFER, companyBalance, accountTotals, incomeTotal, expenseTotal } from './finance.js'

const day = (iso) => new Date(`${iso}T12:00:00`)
const tx = (over) => ({ id: 'x', amount: 1_000_000, date: day('2026-05-04'), ...over })

describe('transferPairs', () => {
  it('находит пару: расход и доход одной суммы в один день по разным кассам', () => {
    const list = [
      tx({ id: 'out', kind: 'expense', accountId: 'rs', comment: 'перевод с р/с на карту' }),
      tx({ id: 'in', kind: 'income', accountId: 'card' }),
    ]
    const pairs = transferPairs(list)

    expect(pairs).toHaveLength(1)
    expect(pairs[0].expense.id).toBe('out')
    expect(pairs[0].income.id).toBe('in')
    expect(pairs[0].amount).toBe(1_000_000)
  })

  it('оплата ученика переводом не считается — за ней стоит ребёнок', () => {
    const list = [
      tx({ id: 'out', kind: 'expense', accountId: 'rs' }),
      tx({ id: 'in', kind: 'income', accountId: 'card', clientId: 'child' }),
    ]
    expect(transferPairs(list)).toEqual([])
  })

  it('одна касса — не перевод: деньги никуда не двинулись', () => {
    const list = [
      tx({ id: 'out', kind: 'expense', accountId: 'card' }),
      tx({ id: 'in', kind: 'income', accountId: 'card' }),
    ]
    expect(transferPairs(list)).toEqual([])
  })

  it('разные дни — не пара', () => {
    const list = [
      tx({ id: 'out', kind: 'expense', accountId: 'rs' }),
      tx({ id: 'in', kind: 'income', accountId: 'card', date: day('2026-05-05') }),
    ]
    expect(transferPairs(list)).toEqual([])
  })

  it('один доход не сводится с двумя расходами', () => {
    const list = [
      tx({ id: 'out1', kind: 'expense', accountId: 'rs' }),
      tx({ id: 'out2', kind: 'expense', accountId: 'cash' }),
      tx({ id: 'in', kind: 'income', accountId: 'card' }),
    ]
    expect(transferPairs(list)).toHaveLength(1)
  })
})

describe('перевод в денежной модели', () => {
  const accounts = [{ id: 'rs', name: 'Расчётный счёт' }, { id: 'card', name: 'Карта' }]

  const pair = [
    tx({ id: 'out', kind: 'expense', accountId: 'rs', comment: 'перевод на карту' }),
    tx({ id: 'in', kind: 'income', accountId: 'card' }),
  ]
  const merged = [{ id: 'tr', ...toTransferDoc(transferPairs(pair)[0]) }]

  it('сведение пары не меняет ни баланс компании, ни остатки касс', () => {
    expect(companyBalance(merged)).toBe(companyBalance(pair))

    const before = accountTotals(pair, accounts)
    const after = accountTotals(merged, accounts)
    expect(after.map(a => a.total)).toEqual(before.map(a => a.total))
    // Из расчётного счёта ушло, на карту пришло.
    expect(after.find(a => a.id === 'rs').total).toBe(-1_000_000)
    expect(after.find(a => a.id === 'card').total).toBe(1_000_000)
  })

  it('но убирает выдуманные доход и расход', () => {
    expect(incomeTotal(pair)).toBe(1_000_000)
    expect(expenseTotal(pair)).toBe(1_000_000)

    expect(incomeTotal(merged)).toBe(0)
    expect(expenseTotal(merged)).toBe(0)
  })

  it('перевод не двигает баланс компании: деньги остались внутри', () => {
    expect(companyBalance(merged)).toBe(0)
    expect(merged[0].kind).toBe(KIND_TRANSFER)
  })

  it('сумма остатков по кассам по-прежнему равна балансу компании', () => {
    const total = accountTotals(merged, accounts).reduce((s, a) => s + a.total, 0)
    expect(total).toBe(companyBalance(merged))
  })
})

describe('pairsSum', () => {
  it('складывает суммы отмеченных пар', () => {
    expect(pairsSum([{ amount: 3_700_000 }, { amount: 3_100_000 }])).toBe(6_800_000)
  })
})
