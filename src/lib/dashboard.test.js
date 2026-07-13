import { describe, it, expect } from 'vitest'
import {
  lessonsOfDay, debtors, prepaidClients, incomeBetween, monthStartISO,
  daysUntil, daysUntilBirthday, upcomingBirthdays,
} from './dashboard.js'

const TODAY = '2026-07-13'

const client = (id, extra = {}) => ({ id, childName: `Ученик ${id}`, ...extra })

describe('lessonsOfDay', () => {
  const lessons = [
    { id: 'l1', date: TODAY, timeFrom: '15:00', status: 'planned' },
    { id: 'l2', date: TODAY, timeFrom: '10:00', status: 'conducted' },
    { id: 'l3', date: TODAY, timeFrom: '12:00', status: 'cancelled' },
    { id: 'l4', date: '2026-07-14', timeFrom: '09:00', status: 'planned' },
  ]

  it('берёт только сегодняшние и сортирует по времени', () => {
    expect(lessonsOfDay(lessons, TODAY).map(l => l.id)).toEqual(['l2', 'l1'])
  })

  it('отменённое занятие не показывает — делать по нему нечего', () => {
    expect(lessonsOfDay(lessons, TODAY).some(l => l.id === 'l3')).toBe(false)
  })
})

describe('debtors', () => {
  const clients = [
    client('a'), client('b'), client('c'),
    client('lead', { status: 'lead' }),
  ]
  const balances = new Map([['a', -50000], ['b', 120000], ['c', -300000], ['lead', -1000]])

  it('только минусовые балансы, крупный долг первым', () => {
    expect(debtors(clients, balances).map(d => d.client.id)).toEqual(['c', 'a'])
  })

  it('лид в должники не попадает', () => {
    expect(debtors(clients, balances).some(d => d.client.id === 'lead')).toBe(false)
  })
})

describe('prepaidClients', () => {
  const pack = (clientId, extra = {}) => ({
    id: `s-${clientId}`, clientId, name: 'Пакет 8',
    lessonsTotal: 8, price: 800000, startDate: '2026-06-01', endDate: '2026-09-01',
    status: 'active', ...extra,
  })

  it('берёт только тех, кто заплатил вперёд, крупная предоплата первой', () => {
    const clients = [client('a'), client('b'), client('c')]
    const balances = new Map([['a', 200000], ['b', -50000], ['c', 900000]])

    const rows = prepaidClients(clients, [pack('a'), pack('c')], balances, [], { today: TODAY })
    expect(rows.map(r => r.client.id)).toEqual(['c', 'a'])
  })

  it('считает, на сколько занятий хватит денег по цене абонемента', () => {
    const balances = new Map([['a', 250000]]) // цена занятия 100 000 → 2 урока
    const rows = prepaidClients([client('a')], [pack('a')], balances, [], { today: TODAY })
    expect(rows[0].lessonsLeft).toBe(2)
  })

  it('нулевой баланс — не предоплата', () => {
    const balances = new Map([['a', 0]])
    expect(prepaidClients([client('a')], [pack('a')], balances, [], { today: TODAY })).toEqual([])
  })

  it('лид в список не попадает', () => {
    const clients = [client('lead', { status: 'lead' })]
    const balances = new Map([['lead', 300000]])
    expect(prepaidClients(clients, [], balances, [], { today: TODAY })).toEqual([])
  })
})

describe('incomeBetween', () => {
  const tx = [
    { id: 't1', kind: 'income', amount: 100000, date: '2026-07-13' },
    { id: 't2', kind: 'income', amount: 200000, date: '2026-07-01' },
    { id: 't3', kind: 'income', amount: 300000, date: '2026-06-30' },
    { id: 't4', kind: 'expense', amount: 500000, date: '2026-07-13' },
    { id: 't5', kind: 'salary', amount: 400000, date: '2026-07-13' },
  ]

  it('за сегодня — только доходы этого дня', () => {
    expect(incomeBetween(tx, TODAY, TODAY)).toBe(100000)
  })

  it('за месяц — с первого числа по сегодня', () => {
    expect(incomeBetween(tx, monthStartISO(TODAY), TODAY)).toBe(300000)
  })

  it('расходы и зарплаты в поступления не идут', () => {
    expect(incomeBetween(tx, TODAY, TODAY)).not.toContain(500000)
  })

  it('дату-Timestamp понимает так же, как строку', () => {
    const stamped = [{ id: 't6', kind: 'income', amount: 50000, date: new Date('2026-07-13T09:00:00') }]
    expect(incomeBetween(stamped, TODAY, TODAY)).toBe(50000)
  })
})

describe('monthStartISO', () => {
  it('первое число текущего месяца', () => {
    expect(monthStartISO(TODAY)).toBe('2026-07-01')
  })
})

describe('daysUntil', () => {
  it('считает полные дни', () => {
    expect(daysUntil('2026-07-20', TODAY)).toBe(7)
    expect(daysUntil('2026-07-13', TODAY)).toBe(0)
    expect(daysUntil('2026-07-10', TODAY)).toBe(-3)
  })

  it('без даты — null, а не ноль: бессрочный абонемент не истекает', () => {
    expect(daysUntil('', TODAY)).toBe(null)
    expect(daysUntil(undefined, TODAY)).toBe(null)
  })
})

describe('daysUntilBirthday', () => {
  it('день рождения сегодня — ноль', () => {
    expect(daysUntilBirthday('2015-07-13', TODAY)).toBe(0)
  })

  it('прошедший в этом году переносится на следующий', () => {
    expect(daysUntilBirthday('2015-07-12', TODAY)).toBe(364) // до 12.07.2027, год невисокосный
  })

  it('через новый год список не рвётся', () => {
    expect(daysUntilBirthday('2015-01-05', '2025-12-30')).toBe(6)
  })
})

describe('upcomingBirthdays', () => {
  const clients = [
    client('a', { birthDate: '2015-07-15' }),
    client('b', { birthDate: '2016-07-14' }),
    client('c', { birthDate: '2016-10-01' }), // далеко
    client('d', {}),                          // даты нет
    client('lead', { birthDate: '2016-07-14', status: 'lead' }),
  ]

  it('только ближайшие две недели, по возрастанию', () => {
    const rows = upcomingBirthdays(clients, { today: TODAY })
    expect(rows.map(r => r.client.id)).toEqual(['b', 'a'])
    expect(rows[0].daysLeft).toBe(1)
  })

  it('считает возраст на день праздника, а не на сегодня', () => {
    const rows = upcomingBirthdays(clients, { today: TODAY })
    expect(rows.find(r => r.client.id === 'a').turns).toBe(11)
  })
})
