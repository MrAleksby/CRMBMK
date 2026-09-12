import { describe, it, expect } from 'vitest'
import {
  EARN, SPEND, REASON_TRIAL, REASON_VISIT, DEFAULT_RULES, bonusRules,
  bonusBalances, bonusBalanceOf, earnedBonuses, spentBonuses, validateBonusSpending, invitedBy,
} from './bonus'
import {
  formToSubscriptionDoc, validateSubscriptionForm, emptySubscriptionForm,
} from './subscription'
import { perLessonPrice } from './directories'

// Бонус — право на скидку, а не деньги. Проверяем правило владельца:
// первое проведённое занятие приглашённого даёт 50 000, каждое следующее 10 000.

const referrer = { id: 'sasha', childName: 'Саша' }
const invited = { id: 'dima', childName: 'Дима', referrerId: 'sasha' }
const stranger = { id: 'olya', childName: 'Оля' }
const clients = [referrer, invited, stranger]

const present = (clientId) => ({ clientId, status: 'present' })
const lesson = { id: 'l1' }

describe('начисление за приглашённого', () => {
  it('первое проведённое занятие приглашённого даёт пробный бонус', () => {
    const [doc] = earnedBonuses({ lesson, attendance: [present('dima')], clients })

    expect(doc.amount).toBe(50_000)
    expect(doc.reason).toBe(REASON_TRIAL)
    expect(doc.clientId).toBe('sasha')
    expect(doc.invitedId).toBe('dima')
    expect(doc.lessonId).toBe('l1')
  })

  it('каждое следующее посещение даёт обычный бонус', () => {
    const prior = [{ kind: EARN, reason: REASON_TRIAL, clientId: 'sasha', invitedId: 'dima', amount: 50_000 }]
    const [doc] = earnedBonuses({ lesson, attendance: [present('dima')], clients, priorBonuses: prior })

    expect(doc.amount).toBe(10_000)
    expect(doc.reason).toBe(REASON_VISIT)
  })

  it('пропуск бонуса не даёт: платят за посещение', () => {
    const docs = earnedBonuses({ lesson, attendance: [{ clientId: 'dima', status: 'absent' }], clients })
    expect(docs).toEqual([])
  })

  it('ребёнок без пригласившего никому ничего не приносит', () => {
    expect(earnedBonuses({ lesson, attendance: [present('olya')], clients })).toEqual([])
  })

  it('приглашение внутри семьи бонуса не даёт — кошелёк общий', () => {
    const family = [
      { id: 'sasha', childName: 'Саша', familyId: 'f1' },
      { id: 'dima', childName: 'Дима', referrerId: 'sasha', familyId: 'f1' },
    ]
    expect(earnedBonuses({ lesson, attendance: [present('dima')], clients: family })).toEqual([])
  })

  it('бонус идёт на семью пригласившего, если она есть', () => {
    const withFamily = [{ ...referrer, familyId: 'f2' }, invited]
    const [doc] = earnedBonuses({ lesson, attendance: [present('dima')], clients: withFamily })

    expect(doc.familyId).toBe('f2')
  })

  it('суммы берутся из настроек', () => {
    const rules = bonusRules({ trial: 70_000, visit: 15_000 })
    const [doc] = earnedBonuses({ lesson, attendance: [present('dima')], clients, rules })

    expect(doc.amount).toBe(70_000)
  })

  it('пустые настройки не ломают правило', () => {
    expect(bonusRules(null)).toEqual(DEFAULT_RULES)
    expect(bonusRules({ trial: 0 })).toEqual({ trial: 0, visit: 10_000 })
  })

  it('двое приглашённых на одном занятии дают два бонуса', () => {
    const second = { id: 'katya', childName: 'Катя', referrerId: 'sasha' }
    const docs = earnedBonuses({
      lesson, attendance: [present('dima'), present('katya')], clients: [...clients, second],
    })

    expect(docs).toHaveLength(2)
    expect(docs.every(d => d.amount === 50_000)).toBe(true)
  })
})

describe('остаток бонусов', () => {
  const bonuses = [
    { kind: EARN, amount: 50_000, clientId: 'sasha', familyId: '' },
    { kind: EARN, amount: 10_000, clientId: 'sasha', familyId: '' },
    { kind: SPEND, amount: 30_000, clientId: 'sasha', familyId: '' },
  ]

  it('начисления минус траты', () => {
    expect(bonusBalanceOf(referrer, bonuses)).toBe(30_000)
  })

  it('у семьи бонусы общие', () => {
    const shared = [
      { kind: EARN, amount: 50_000, clientId: 'sasha', familyId: 'f1' },
      { kind: EARN, amount: 10_000, clientId: 'brat', familyId: 'f1' },
    ]
    expect(bonusBalances(shared).get('family:f1')).toBe(60_000)
    expect(bonusBalanceOf({ id: 'brat', familyId: 'f1' }, shared)).toBe(60_000)
  })

  it('чужие бонусы в остаток не попадают', () => {
    expect(bonusBalanceOf(stranger, bonuses)).toBe(0)
  })
})

describe('трата бонусов', () => {
  it('введённое в журнале становится списанием с кошелька', () => {
    const attendance = [{ clientId: 'sasha', status: 'present', amountBonus: 20_000 }]
    const [doc] = spentBonuses({ lesson, attendance, clients })

    expect(doc.kind).toBe(SPEND)
    expect(doc.amount).toBe(20_000)
    expect(doc.lessonId).toBe('l1')
  })

  it('больше остатка списать нельзя', () => {
    const bonuses = [{ kind: EARN, amount: 30_000, clientId: 'sasha', familyId: '' }]
    const rows = [{ clientId: 'sasha', clientName: 'Саша', amountBonus: '50000' }]

    expect(validateBonusSpending(rows, clients, bonuses)).toMatch(/не хватает/)
  })

  it('брат с сестрой на одном занятии не потратят один бонус дважды', () => {
    const family = [
      { id: 'a', childName: 'Анна', familyId: 'f1' },
      { id: 'b', childName: 'Пётр', familyId: 'f1' },
    ]
    const bonuses = [{ kind: EARN, amount: 50_000, clientId: 'a', familyId: 'f1' }]
    const rows = [
      { clientId: 'a', clientName: 'Анна', amountBonus: '30000' },
      { clientId: 'b', clientName: 'Пётр', amountBonus: '30000' },
    ]

    // Порознь каждая строка прошла бы: 30 000 меньше 50 000.
    expect(validateBonusSpending(rows, family, bonuses)).toMatch(/не хватает/)
  })

  it('в пределах остатка всё проходит', () => {
    const bonuses = [{ kind: EARN, amount: 50_000, clientId: 'sasha', familyId: '' }]
    const rows = [{ clientId: 'sasha', clientName: 'Саша', amountBonus: '50000' }]

    expect(validateBonusSpending(rows, clients, bonuses)).toBe(null)
  })
})

describe('кого пригласил', () => {
  it('видно список приглашённых', () => {
    expect(invitedBy(referrer, clients).map(c => c.id)).toEqual(['dima'])
    expect(invitedBy(stranger, clients)).toEqual([])
  })
})


// Бонус при выдаче абонемента уменьшает не только оплату, но и цену пакета.
// Иначе занятий будет на полную сумму, денег придёт меньше, и подаренное
// вернётся к родителю долгом.
describe('бонус в абонементе', () => {
  const pkg = { id: 'p8', name: 'Пакет 8', lessonsCount: 8, price: 2_640_000 }
  const form = { startDate: '2026-01-01', endDate: '', note: '' }

  it('скидка уменьшает цену абонемента', () => {
    const doc = formToSubscriptionDoc(form, pkg, 'sasha', '', 100_000)

    expect(doc.price).toBe(2_540_000)
    expect(doc.lessonsTotal).toBe(8)
    expect(perLessonPrice({ lessonsCount: doc.lessonsTotal, price: doc.price })).toBe(317_500)
  })

  it('без бонуса цена прежняя', () => {
    expect(formToSubscriptionDoc(form, pkg, 'sasha').price).toBe(2_640_000)
  })

  it('больше бонусов, чем есть, потратить нельзя', () => {
    const payment = {
      ...emptySubscriptionForm(), packageId: 'p8',
      payAmount: '2540000', payBonus: '100000',
      payAccountId: 'acc', payCategoryId: 'cat', payDate: '2026-01-01',
    }

    expect(validateSubscriptionForm(payment, [pkg], true, 50_000)).toMatch(/Бонусов только/)
    expect(validateSubscriptionForm(payment, [pkg], true, 100_000)).toBe(null)
  })

  it('пакет можно закрыть бонусами целиком, без денег', () => {
    const payment = {
      ...emptySubscriptionForm(), packageId: 'p8',
      payAmount: '0', payBonus: '2640000',
      payAccountId: 'acc', payCategoryId: 'cat', payDate: '2026-01-01',
    }

    expect(validateSubscriptionForm(payment, [pkg], true, 2_640_000)).toBe(null)
    expect(formToSubscriptionDoc(form, pkg, 'sasha', '', 2_640_000).price).toBe(0)
  })

  it('пустая оплата без бонуса по-прежнему ошибка', () => {
    const payment = {
      ...emptySubscriptionForm(), packageId: 'p8',
      payAmount: '', payBonus: '',
      payAccountId: 'acc', payCategoryId: 'cat', payDate: '2026-01-01',
    }

    expect(validateSubscriptionForm(payment, [pkg], true, 0)).toBe('Укажите сумму оплаты')
  })
})
