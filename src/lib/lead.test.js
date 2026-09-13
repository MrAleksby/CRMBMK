import { describe, it, expect } from 'vitest'
import { emptyLeadForm, leadToForm, leadFormToDoc, clientFormFromLead } from './lead'
import { emptyClientForm } from './client'

// Первое занятие приглашённого почти всегда пробное, а пробное проходит ещё
// лидом. Поэтому пригласивший указывается у лида и переезжает в карточку
// ученика: бонусы считаются по карточке, и без переноса начислять было бы
// некому — как раз тот случай, ради которого всё это делалось.
describe('пригласивший у лида', () => {
  it('переезжает в заготовку карточки ученика', () => {
    const lead = { childName: 'Дима', referrerId: 'sasha' }
    const form = clientFormFromLead(lead, emptyClientForm())

    expect(form.referrerId).toBe('sasha')
  })

  it('у лида без пригласившего поле пустое, а не потерянное', () => {
    const form = clientFormFromLead({ childName: 'Дима' }, emptyClientForm())
    expect(form.referrerId).toBe('')
  })

  it('сохраняется в документе лида', () => {
    const form = { ...emptyLeadForm(), childName: 'Дима', referrerId: 'sasha' }
    expect(leadFormToDoc(form).referrerId).toBe('sasha')
  })

  it('читается обратно в форму при правке', () => {
    expect(leadToForm({ childName: 'Дима', referrerId: 'sasha' }).referrerId).toBe('sasha')
  })

  it('остальные данные лида по-прежнему переносятся', () => {
    const lead = {
      childName: 'Дима', parentName: 'Мама Дима', phones: ['+998901112233'],
      source: 'recommendation', note: 'придёт в субботу', referrerId: 'sasha',
    }
    const form = clientFormFromLead(lead, emptyClientForm())

    expect(form.childName).toBe('Дима')
    expect(form.mother.name).toBe('Мама Дима')
    expect(form.mother.phones).toEqual(['+998901112233'])
    expect(form.notes).toBe('придёт в субботу')
  })
})
