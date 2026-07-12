import { describe, it, expect } from 'vitest'
import { clientBalance, clientBalances, debtAndPrepaid } from './balance'

// Баланс ученика = оплаты − возвраты − начисления.
// Плюс — предоплата, минус — долг. Ровно как в AlfaCRM.

const income = (clientId, amount) => ({ kind: 'income', clientId, amount })
const refund = (clientId, amount) => ({ kind: 'refund', clientId, amount })
const charge = (clientId, amount) => ({ clientId, amount })

describe('clientBalance', () => {
  it('оплаты минус начисления', () => {
    const tx = [income('a', 1_000_000), income('a', 500_000)]
    const charges = [charge('a', 300_000), charge('a', 300_000)]
    expect(clientBalance(tx, charges, 'a')).toBe(900_000)
  })

  it('возврат уменьшает предоплату', () => {
    const tx = [income('a', 1_000_000), refund('a', 400_000)]
    expect(clientBalance(tx, [], 'a')).toBe(600_000)
  })

  it('долг — отрицательный баланс', () => {
    expect(clientBalance([income('a', 100_000)], [charge('a', 330_000)], 'a')).toBe(-230_000)
  })

  it('доход без ученика — деньги компании, на баланс не влияет', () => {
    const tx = [income('a', 100_000), { kind: 'income', amount: 999_999 }]   // кешбек банка
    expect(clientBalance(tx, [], 'a')).toBe(100_000)
  })

  it('расходы и зарплаты не касаются лицевого счёта', () => {
    const tx = [
      income('a', 500_000),
      { kind: 'expense', clientId: 'a', amount: 100_000 },
      { kind: 'salary', clientId: 'a', amount: 100_000 },
    ]
    expect(clientBalance(tx, [], 'a')).toBe(500_000)
  })

  it('чужие операции не считаются', () => {
    const tx = [income('a', 100_000), income('b', 999_999)]
    const charges = [charge('b', 500_000)]
    expect(clientBalance(tx, charges, 'a')).toBe(100_000)
  })
})

describe('clientBalances — один проход по всем ученикам', () => {
  it('совпадает с поштучным расчётом', () => {
    const tx = [income('a', 1_000_000), income('b', 200_000), refund('b', 50_000)]
    const charges = [charge('a', 330_000), charge('c', 100_000)]

    const map = clientBalances(tx, charges)
    for (const id of ['a', 'b', 'c']) {
      expect(map.get(id)).toBe(clientBalance(tx, charges, id))
    }
  })

  it('операции без ученика не создают записей', () => {
    const map = clientBalances([{ kind: 'income', amount: 100 }], [])
    expect(map.size).toBe(0)
  })
})

describe('debtAndPrepaid', () => {
  it('долги — сумма отрицательных, предоплаты — положительных', () => {
    const balances = new Map([['a', -500_000], ['b', 300_000], ['c', 0], ['d', -100_000]])
    expect(debtAndPrepaid(balances)).toEqual({ debt: 600_000, prepaid: 300_000 })
  })
})
