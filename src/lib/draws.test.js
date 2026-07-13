import { describe, it, expect } from 'vitest'
import { isDrawCandidate, drawCandidates, toDrawDoc, drawSum } from './draws.js'
import {
  KIND_DRAW, companyBalance, periodCashFlow, salaryTotal, drawTotal, accountTotals,
} from './finance.js'

const tx = (extra) => ({ id: 'x', amount: 100000, date: '2026-07-01', accountId: 'cash', ...extra })

describe('drawCandidates', () => {
  // Изъятия нашлись и среди выплат без комментария — владелец брал себе и молча.
  it('кандидат — любая выплата ЗП, с комментарием и без', () => {
    expect(isDrawCandidate(tx({ kind: 'salary', comment: 'Продукты' }))).toBe(true)
    expect(isDrawCandidate(tx({ kind: 'salary', comment: '' }))).toBe(true)
  })

  it('расходы и доходы не предлагаются', () => {
    expect(isDrawCandidate(tx({ kind: 'expense', comment: 'Продукты' }))).toBe(false)
    expect(isDrawCandidate(tx({ kind: 'income', comment: 'Продукты' }))).toBe(false)
  })

  it('уже переразмеченное изъятие второй раз не предлагается', () => {
    expect(isDrawCandidate(tx({ kind: KIND_DRAW, comment: 'Продукты' }))).toBe(false)
  })

  it('можно сузить до одного сотрудника', () => {
    const list = [
      tx({ id: 'a', kind: 'salary', comment: 'Продукты', teacherId: 'owner' }),
      tx({ id: 'b', kind: 'salary', comment: 'Аутсорс дизайна', teacherId: 'other' }),
    ]
    expect(drawCandidates(list, { teacherId: 'owner' }).map(t => t.id)).toEqual(['a'])
    expect(drawCandidates(list).map(t => t.id).sort()).toEqual(['a', 'b'])
  })

  it('«без получателя» — это процент менеджера и аутсорс, у них teacherId пуст', () => {
    const list = [
      tx({ id: 'a', kind: 'salary', teacherId: 'owner' }),
      tx({ id: 'b', kind: 'salary', teacherId: '' }),
    ]
    expect(drawCandidates(list, { teacherId: 'none' }).map(t => t.id)).toEqual(['b'])
  })

  it('фильтр по наличию комментария', () => {
    const list = [
      tx({ id: 'with', kind: 'salary', comment: 'Продукты' }),
      tx({ id: 'blank', kind: 'salary', comment: '   ' }),
      tx({ id: 'none', kind: 'salary' }),
    ]
    expect(drawCandidates(list, { comment: 'with' }).map(t => t.id)).toEqual(['with'])
    // Пробелы — это не комментарий.
    expect(drawCandidates(list, { comment: 'without' }).map(t => t.id).sort())
      .toEqual(['blank', 'none'])
  })

  it('свежие сверху', () => {
    const list = [
      tx({ id: 'old', kind: 'salary', comment: 'Дом', date: '2026-01-05' }),
      tx({ id: 'new', kind: 'salary', comment: 'Продукты', date: '2026-07-05' }),
    ]
    expect(drawCandidates(list).map(t => t.id)).toEqual(['new', 'old'])
  })
})

describe('toDrawDoc', () => {
  it('снимает педагога и ставит статью изъятия', () => {
    expect(toDrawDoc('cat-draw')).toEqual({
      kind: KIND_DRAW, categoryId: 'cat-draw', teacherId: '', teacherName: '',
    })
  })
})

describe('drawSum', () => {
  it('складывает суммы отмеченных', () => {
    expect(drawSum([tx({ amount: 100000 }), tx({ amount: 50000 })])).toBe(150000)
  })
})

// Главное, ради чего всё затевалось: изъятие уменьшает кассу, но не прибыль.
describe('изъятие в денежной модели', () => {
  const list = [
    tx({ id: 'i', kind: 'income', amount: 1000000 }),
    tx({ id: 'e', kind: 'expense', amount: 200000 }),
    tx({ id: 's', kind: 'salary', amount: 300000 }),
    tx({ id: 'd', kind: KIND_DRAW, amount: 400000, comment: 'Продукты' }),
  ]

  it('касса уменьшается на изъятие', () => {
    expect(companyBalance(list)).toBe(1000000 - 200000 - 300000 - 400000)
  })

  it('денежный поток до изъятий их не вычитает', () => {
    expect(periodCashFlow(list)).toBe(1000000 - 200000 - 300000)
  })

  it('изъятие не считается зарплатой', () => {
    expect(salaryTotal(list)).toBe(300000)
    expect(drawTotal(list)).toBe(400000)
  })

  it('инвариант держится: сумма остатков по кассам = баланс компании', () => {
    const accounts = [{ id: 'cash', name: 'Наличные' }]
    const totals = accountTotals(list, accounts).reduce((s, a) => s + a.total, 0)
    expect(totals).toBe(companyBalance(list))
  })

  it('перевод зарплаты в изъятие поднимает результат ровно на сумму операции', () => {
    const before = [tx({ id: 'i', kind: 'income', amount: 1000000 }), tx({ id: 's', kind: 'salary', amount: 400000, comment: 'Продукты' })]
    const after = before.map(t => t.id === 's' ? { ...t, ...toDrawDoc('cat-draw') } : t)

    expect(periodCashFlow(after) - periodCashFlow(before)).toBe(400000)
    // А денег в кассе столько же: они как ушли, так и ушли.
    expect(companyBalance(after)).toBe(companyBalance(before))
  })
})
