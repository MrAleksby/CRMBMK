import { describe, it, expect } from 'vitest'
import { clientBalances, debtAndPrepaid, effectiveBalances, walletBalances } from './balance'
import { walletCharges, siblings, namesOf, sharedNote, wallets, familyLabel } from './family'
import { emptyClientForm, validateClientForm, LINK_FAMILY } from './client'
import { activeSubscription, expectedPrice, lessonsLeft, formToSubscriptionDoc } from './subscription'
import { debtors, prepaidClients } from './dashboard'

// Общий кошелёк семьи. Проверяем то, ради чего он затевался: пакет на двоих
// не надо делить заранее, а общие деньги нигде не складываются дважды.

const income = (clientId, amount) => ({ kind: 'income', clientId, amount })
const charge = (clientId, amount) => ({ clientId, amount })

// Анна и Пётр — брат с сестрой, фамилии разные (так бывает).
// Мария — сама по себе.
const anna = { id: 'anna', childName: 'Анна Иванова', familyId: 'f1' }
const petr = { id: 'petr', childName: 'Пётр Сидоров', familyId: 'f1' }
const maria = { id: 'maria', childName: 'Мария Петрова' }
const clients = [anna, petr, maria]
const families = [{ id: 'f1', name: 'Ивановы' }]

// Пакет 8 за 2 640 000 куплен один на двоих, занятие 330 000.
// Записан одной оплатой на Анну. Анна сходила 3 раза, Пётр 5.
const transactions = [income('anna', 2_640_000), income('maria', 1_200_000)]
const charges = [
  ...Array(3).fill(0).map(() => charge('anna', 330_000)),
  ...Array(5).fill(0).map(() => charge('petr', 330_000)),
]

describe('общий кошелёк', () => {
  it('деньги семьи покрывают занятия обоих детей', () => {
    const balances = clientBalances(transactions, charges)
    const shown = effectiveBalances(balances, clients)

    // Пакет отходили целиком: у семьи ноль, хотя платили за одного ребёнка.
    expect(shown.get('anna')).toBe(0)
    expect(shown.get('petr')).toBe(0)
    // Личный баланс Петра сам по себе глубоко в минусе — но платил за него брат.
    expect(balances.get('petr')).toBe(-1_650_000)
  })

  it('остаток один на семью и виден в строке каждого ребёнка', () => {
    // Пётр сходил только раз: потрачено 4 занятия из 8.
    const partial = [charge('anna', 330_000), charge('anna', 330_000),
      charge('anna', 330_000), charge('petr', 330_000)]
    const shown = effectiveBalances(clientBalances(transactions, partial), clients)

    expect(shown.get('anna')).toBe(1_320_000)
    expect(shown.get('petr')).toBe(1_320_000)
  })

  it('одиночку семья не трогает', () => {
    const shown = effectiveBalances(clientBalances(transactions, charges), clients)
    expect(shown.get('maria')).toBe(1_200_000)
  })
})

describe('итоги не двоятся', () => {
  it('предоплата семьи входит в итог один раз', () => {
    const balances = clientBalances(transactions, [charge('anna', 330_000)])
    const { prepaid } = debtAndPrepaid(balances, clients)

    // Семья: 2 640 000 − 330 000 = 2 310 000. Мария: 1 200 000.
    expect(prepaid).toBe(3_510_000)
  })

  it('долг семьи тоже считается один раз', () => {
    const balances = clientBalances([], [charge('anna', 330_000), charge('petr', 330_000)])
    const { debt } = debtAndPrepaid(balances, clients)

    expect(debt).toBe(660_000)
  })

  it('без списка учеников считает по-старому — по детям', () => {
    const balances = clientBalances(transactions, charges)
    const { debt } = debtAndPrepaid(balances)

    // Здесь Пётр «должен» 1 650 000, хотя за него заплатил брат. Ровно поэтому
    // страницы обязаны передавать список учеников.
    expect(debt).toBe(1_650_000)
  })

  it('деньги ученика без карточки не теряются в итоге', () => {
    const balances = clientBalances([income('ghost', 500_000)], [])
    const { prepaid } = debtAndPrepaid(balances, clients)

    expect(prepaid).toBe(500_000)
  })

  it('плюс одного ребёнка и минус другого гасят друг друга, а не идут в обе метрики', () => {
    // Иначе отчёт показал бы у семьи и предоплату (деньги лежат на Анне),
    // и долг Петра — одни и те же деньги в двух метриках сразу.
    const balances = clientBalances(transactions, charges)
    const { debt, prepaid } = debtAndPrepaid(balances, clients)

    expect(debt).toBe(0)
    expect(prepaid).toBe(1_200_000)   // только Мария, семья в нуле
  })
})

describe('подписи и состав семьи', () => {
  it('кошельков столько, сколько плательщиков, а не детей', () => {
    expect(wallets(clients, families).size).toBe(2)
  })

  it('знает имя семьи и её детей', () => {
    const wallet = wallets(clients, families).get('family:f1')

    expect(wallet.familyName).toBe('Ивановы')
    expect(namesOf(wallet.clients)).toBe('Анна Иванова и Пётр Сидоров')
  })

  it('брат и сестра находятся друг у друга', () => {
    expect(siblings(anna, clients).map(c => c.id)).toEqual(['petr'])
    expect(siblings(maria, clients)).toEqual([])
  })

  it('подпись к сумме склоняет число детей', () => {
    expect(sharedNote(2)).toBe('общий на 2 детей')
    expect(sharedNote(21)).toBe('общий на 21 ребёнка')
    expect(sharedNote(1)).toBe('')
  })

  it('долг считается по занятиям всей семьи', () => {
    // Деньги общие, значит и непокрытые занятия ищутся среди общих.
    expect(walletCharges(anna, clients, charges)).toHaveLength(8)
    expect(walletCharges(maria, clients, charges)).toHaveLength(0)
  })
})

describe('баланс кошелька', () => {
  it('складывает детей семьи в одну сумму', () => {
    const totals = walletBalances(clientBalances(transactions, charges), clients)

    expect(totals.get('family:f1')).toBe(0)
    expect(totals.get('client:maria')).toBe(1_200_000)
  })
})


describe('общий пакет семьи', () => {
  // Пакет 8 за 2 640 000 куплен один на двоих. Цена занятия 330 000 — обоим.
  const shared = {
    id: 's1', clientId: 'anna', familyId: 'f1',
    lessonsTotal: 8, price: 2_640_000, startDate: '2026-01-01', endDate: '2026-12-31',
  }
  const today = '2026-06-01'

  it('задаёт цену занятия и тому ребёнку, кому не выдан', () => {
    expect(expectedPrice([shared], 'petr', petr, [], today)).toBe(330_000)
    expect(expectedPrice([shared], 'maria', maria, [], today)).toBe(0)
  })

  it('личный абонемент важнее общего', () => {
    const own = {
      id: 's2', clientId: 'petr',
      lessonsTotal: 4, price: 2_000_000, startDate: '2026-01-01', endDate: '2026-12-31',
    }
    expect(activeSubscription([shared, own], 'petr', today, petr).id).toBe('s2')
    expect(expectedPrice([shared, own], 'petr', petr, [], today)).toBe(500_000)
  })

  it('остаток в уроках считается по общим деньгам', () => {
    // Из пакета отходили 5 занятий, осталось денег на 3 — и это остаток семьи.
    const used = [
      ...Array(2).fill(0).map(() => charge('anna', 330_000)),
      ...Array(3).fill(0).map(() => charge('petr', 330_000)),
    ]
    const balance = effectiveBalances(clientBalances(transactions, used), clients).get('petr')

    expect(lessonsLeft([shared], 'petr', balance, used, petr, today)).toBe(3)
  })

  it('галочка «общий» пишет семью в документ, без неё абонемент личный', () => {
    const form = { startDate: '2026-01-01', endDate: '', note: '' }
    const pkg = { id: 'p8', name: 'Пакет 8', lessonsCount: 8, price: 2_640_000 }

    expect(formToSubscriptionDoc(form, pkg, 'anna', 'f1').familyId).toBe('f1')
    expect(formToSubscriptionDoc(form, pkg, 'anna').familyId).toBe('')
  })
})

describe('списки дашборда', () => {
  it('долг семьи — одна строка с обоими именами, а не две', () => {
    const balances = effectiveBalances(
      clientBalances([], [charge('anna', 330_000), charge('petr', 330_000)]), clients)
    const rows = debtors(clients, balances)

    expect(rows).toHaveLength(1)
    expect(rows[0].balance).toBe(-660_000)
    expect(rows[0].name).toBe('Анна Иванова и Пётр Сидоров')
  })

  it('предоплата семьи тоже не занимает две строки', () => {
    const balances = effectiveBalances(clientBalances(transactions, []), clients)
    const rows = prepaidClients(clients, [], balances, [], { today: '2026-06-01' })

    expect(rows.map(r => r.name)).toEqual(['Анна Иванова и Пётр Сидоров', 'Мария Петрова'])
  })
})


// Названия у семьи нет намеренно: фамилии у брата и сестры бывают разными,
// и «семья Ивановых» была бы неправдой. Подписываем именами детей.
describe('как подписана семья', () => {
  it('в строке ребёнка стоят имена остальных детей', () => {
    expect(familyLabel(anna, clients)).toBe('Пётр Сидоров')
    expect(familyLabel(petr, clients)).toBe('Анна Иванова')
  })

  it('у одиночки подписи нет', () => {
    expect(familyLabel(maria, clients)).toBe('')
  })

  it('троих перечисляет через «и»', () => {
    const third = { id: 'olga', childName: 'Ольга Иванова', familyId: 'f1' }
    expect(familyLabel(anna, [...clients, third])).toBe('Пётр Сидоров и Ольга Иванова')
  })
})

describe('связывание счёта', () => {
  const form = () => ({ ...emptyClientForm(), childName: 'Пётр', mother: { ...emptyClientForm().mother, name: 'Мама' } })

  it('нельзя связать счёт, не выбрав ученика', () => {
    expect(validateClientForm({ ...form(), familyId: LINK_FAMILY }))
      .toBe('Выберите ученика, с которым общий счёт')
  })

  it('выбран ученик — форма проходит', () => {
    expect(validateClientForm({ ...form(), familyId: LINK_FAMILY, linkClientId: 'anna' })).toBe(null)
  })
})
