import { describe, it, expect } from 'vitest'
import {
  clientHistory, whyKeepClient, contactTitle, contactRows,
  isLeadClient, lessonsLabel, formToDoc, emptyClientForm, validateClientForm,
} from './client'

// Удаление ученика с историей стирало бы и его оплаты, а деньги лежали в кассе:
// доходы и остатки за закрытые месяцы поехали бы задним числом. Поэтому удалять
// можно только пустую карточку — дубль, ошибку ввода, тест.

const income = (clientId, amount) => ({ kind: 'income', clientId, amount })

describe('clientHistory — можно ли удалять ученика', () => {
  it('пустая карточка: ни денег, ни занятий', () => {
    const history = clientHistory('a', { transactions: [], charges: [], lessons: [] })
    expect(history.isEmpty).toBe(true)
  })

  it('есть оплата — карточка не пустая', () => {
    const history = clientHistory('a', {
      transactions: [income('a', 500_000)], charges: [], lessons: [],
    })
    expect(history.isEmpty).toBe(false)
    expect(history.payments).toBe(1)
    expect(history.paidTotal).toBe(500_000)
  })

  it('есть начисление — карточка не пустая', () => {
    const history = clientHistory('a', {
      transactions: [], charges: [{ clientId: 'a', amount: 330_000 }], lessons: [],
    })
    expect(history.isEmpty).toBe(false)
    expect(history.charges).toBe(1)
  })

  it('есть проведённое занятие — карточка не пустая, даже если денег не было', () => {
    const lessons = [{ status: 'conducted', studentIds: ['a'] }]
    const history = clientHistory('a', { transactions: [], charges: [], lessons })

    expect(history.isEmpty).toBe(false)
    expect(history.lessons).toBe(1)
  })

  it('запланированное занятие историей не считается: стирать нечего', () => {
    const lessons = [{ status: 'planned', studentIds: ['a'] }]
    const history = clientHistory('a', { transactions: [], charges: [], lessons })

    expect(history.isEmpty).toBe(true)
  })

  it('чужие деньги и занятия не мешают удалить пустую карточку', () => {
    const history = clientHistory('a', {
      transactions: [income('b', 999_999)],
      charges: [{ clientId: 'b', amount: 330_000 }],
      lessons: [{ status: 'conducted', studentIds: ['b'] }],
    })
    expect(history.isEmpty).toBe(true)
  })

  it('объяснение называет и занятия, и деньги', () => {
    const history = clientHistory('a', {
      transactions: [income('a', 500_000)],
      charges: [],
      lessons: [{ status: 'conducted', studentIds: ['a'] }],
    })
    const message = whyKeepClient({ childName: 'Аня' }, history)

    expect(message).toContain('Аня')
    expect(message).toContain('проведённых занятий: 1')
    expect(message).toContain('оплат: 1')
    expect(message).toMatch(/500\s000/)   // toLocaleString ставит неразрывный пробел
    expect(message).toContain('Бросил')
  })
})

describe('contactTitle — роль не дублируется', () => {
  it('роль уже в имени — не дописываем: было «Самира мама мама»', () => {
    expect(contactTitle({ role: 'Мама', name: 'Самира мама' })).toBe('Самира мама')
  })

  it('обычное имя — роль добавляется', () => {
    expect(contactTitle({ role: 'Мама', name: 'Жанна' })).toBe('Жанна мама')
  })

  it('имени нет — показываем роль', () => {
    expect(contactTitle({ role: 'Мама', name: '' })).toBe('Мама')
  })

  it('регистр не важен', () => {
    expect(contactTitle({ role: 'Мама', name: 'МАМА Лола' })).toBe('МАМА Лола')
  })
})

describe('contactRows', () => {
  it('мама и папа — отдельными строками', () => {
    const rows = contactRows({
      mother: { name: 'Аня', phones: ['+998901112233'] },
      father: { name: 'Пётр', phones: ['+998901112244'] },
    })
    expect(rows.map(r => r.role)).toEqual(['Мама', 'Папа'])
  })

  it('пустой родитель не создаёт строку', () => {
    const rows = contactRows({ mother: { name: 'Аня', phones: ['+998901112233'] }, father: {} })
    expect(rows).toHaveLength(1)
  })
})

describe('isLeadClient', () => {
  it('карточка лида', () => {
    expect(isLeadClient({ status: 'lead' })).toBe(true)
  })

  it('обычный ученик — без статуса считается активным', () => {
    expect(isLeadClient({})).toBe(false)
    expect(isLeadClient({ status: 'active' })).toBe(false)
  })
})

describe('lessonsLabel — склонение', () => {
  it('1 урок, 3 урока, 5 уроков', () => {
    expect(lessonsLabel(1)).toBe('1 урок')
    expect(lessonsLabel(3)).toBe('3 урока')
    expect(lessonsLabel(5)).toBe('5 уроков')
    expect(lessonsLabel(11)).toBe('11 уроков')
    expect(lessonsLabel(21)).toBe('21 урок')
  })

  it('долг — минус тоже склоняется', () => {
    expect(lessonsLabel(-1)).toBe('-1 урок')
    expect(lessonsLabel(-22)).toBe('-22 урока')
  })
})

describe('validateClientForm', () => {
  it('без имени ребёнка сохранять нельзя', () => {
    const form = emptyClientForm()
    expect(validateClientForm(form)).toBeTruthy()
  })

  it('юрлицо-заказчик обязано быть выбрано', () => {
    const form = { ...emptyClientForm(), childName: 'Аня', payerType: 'legal', legalEntityId: '' }
    expect(validateClientForm(form)).toBeTruthy()
  })

  // Ребёнок без родителя недостижим: звонить будет некому.
  it('нужен хотя бы один родитель', () => {
    const form = { ...emptyClientForm(), childName: 'Аня' }
    expect(validateClientForm(form)).toBeTruthy()
  })

  it('имя ребёнка и мама — этого достаточно', () => {
    const form = { ...emptyClientForm(), childName: 'Аня' }
    form.mother.name = 'Самира'
    expect(validateClientForm(form)).toBeFalsy()
  })
})

describe('formToDoc', () => {
  it('юрлицо не сохраняется, если платят родители', () => {
    const form = { ...emptyClientForm(), childName: 'Аня', payerType: 'parent', legalEntityId: 'x' }
    expect(formToDoc(form).legalEntityId).toBe('')
  })
})
