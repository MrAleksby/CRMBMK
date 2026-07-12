import { describe, it, expect } from 'vitest'
import { lessonsLeft, suggestPrice, endDateFromWeeks, weeksBetween } from './subscription'

// Остаток в уроках выводится из денег, а не из счётчика: цена занятия у каждого
// своя и меняется от раза к разу, поэтому счётчик неизбежно разошёлся бы с кассой.
//
// Предоплата: floor(баланс ÷ цена занятия), цена — по цепочке
// абонемент → персональная цена ребёнка → последняя фактическая сумма из журнала.
// Долг: сколько ПОСЛЕДНИХ проведённых занятий не покрыто деньгами — по фактическим
// суммам, а не по средней.

const TODAY = '2026-07-12'

const sub = (over = {}) => ({
  id: 's1', clientId: 'a', lessonsTotal: 8, price: 2_640_000,
  startDate: '2026-06-01', endDate: '2026-09-01', status: 'active', ...over,
})

const charge = (amount, date = '2026-07-01') => ({ clientId: 'a', amount, date, lessons: 1 })

describe('lessonsLeft — предоплата', () => {
  it('делит баланс на цену занятия из абонемента', () => {
    // 2 640 000 / 8 = 330 000 за занятие; 990 000 / 330 000 = 3
    expect(lessonsLeft([sub()], 'a', 990_000, [], null, TODAY)).toBe(3)
  })

  it('округляет вниз: на неполное занятие не запишешься', () => {
    expect(lessonsLeft([sub()], 'a', 1_000_000, [], null, TODAY)).toBe(3)
  })

  it('без абонемента берёт персональную цену ребёнка', () => {
    const client = { id: 'a', lessonPrice: 200_000 }
    expect(lessonsLeft([], 'a', 600_000, [], client, TODAY)).toBe(3)
  })

  it('просроченный абонемент цену не даёт', () => {
    const expired = sub({ endDate: '2026-07-01' })
    // Цены нет ниоткуда — остаток посчитать не из чего.
    expect(lessonsLeft([expired], 'a', 990_000, [], null, TODAY)).toBe(0)
  })

  it('архивный абонемент цену не даёт', () => {
    const archived = sub({ status: 'archived' })
    expect(lessonsLeft([archived], 'a', 990_000, [], null, TODAY)).toBe(0)
  })

  it('нулевой баланс — ноль уроков', () => {
    expect(lessonsLeft([sub()], 'a', 0, [], null, TODAY)).toBe(0)
  })
})

describe('lessonsLeft — долг', () => {
  it('считает по фактическим суммам последних занятий, а не по средней', () => {
    // Долг 660 000 покрывает ровно два последних занятия по 330 000.
    const charges = [charge(330_000, '2026-07-01'), charge(330_000, '2026-07-05'), charge(100_000, '2026-06-01')]
    expect(lessonsLeft([sub()], 'a', -660_000, charges, null, TODAY)).toBe(-2)
  })

  it('неполное занятие тоже считается неоплаченным', () => {
    const charges = [charge(330_000, '2026-07-01'), charge(330_000, '2026-07-05')]
    expect(lessonsLeft([sub()], 'a', -400_000, charges, null, TODAY)).toBe(-2)
  })

  it('долг при разной цене занятий', () => {
    // Последние занятия дороже: долг 500 000 = одно занятие по 500 000.
    const charges = [charge(200_000, '2026-06-01'), charge(500_000, '2026-07-05')]
    expect(lessonsLeft([sub()], 'a', -500_000, charges, null, TODAY)).toBe(-1)
  })
})

describe('suggestPrice — подсказка цены', () => {
  it('абонемент важнее персональной цены', () => {
    const client = { id: 'a', lessonPrice: 100_000 }
    expect(suggestPrice(client, [sub()])).toBe(330_000)
  })

  it('без абонемента — персональная цена', () => {
    expect(suggestPrice({ id: 'a', lessonPrice: 100_000 }, [])).toBe(100_000)
  })

  it('ничего не известно — пусто, менеджер введёт руками', () => {
    expect(suggestPrice({ id: 'a' }, [])).toBe('')
  })
})

describe('срок абонемента: недели и дата — одно и то же', () => {
  it('дата окончания из числа недель', () => {
    expect(endDateFromWeeks('2026-06-01', 8)).toBe('2026-07-27')
  })

  it('и обратно', () => {
    expect(weeksBetween('2026-06-01', '2026-07-27')).toBe(8)
  })

  it('без даты начала считать нечего', () => {
    expect(endDateFromWeeks('', 8)).toBe('')
  })
})
