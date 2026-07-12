import { describe, it, expect } from 'vitest'
import { planAttendanceUpdate, buildJournal, journalToAttendance, attendanceTile } from './lesson'

// Правка журнала проведённого занятия — самое опасное место в системе: сумма
// живёт в двух коллекциях сразу (lessons.attendance и charges). Если они разойдутся,
// баланс ученика перестанет сходиться с журналом, и заметят это не скоро.
//
// planAttendanceUpdate строит план правки; применяет его одна транзакция writeBatch.

const noSub = () => null

describe('planAttendanceUpdate', () => {
  it('сумма выросла — начисление обновляется, а не дублируется', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amount: '350000' }]
    const charges = [{ id: 'c1', clientId: 'a', amount: 300_000 }]

    const plan = planAttendanceUpdate(old, rows, { charges, activeSubFor: noSub })

    expect(plan.chargesToUpdate).toEqual([{ id: 'c1', amount: 350_000 }])
    expect(plan.chargesToCreate).toEqual([])
    expect(plan.chargesToDelete).toEqual([])
    expect(plan.attendance[0].amountCharged).toBe(350_000)
  })

  it('сумму стёрли — начисление удаляется, долг снимается', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amount: '' }]
    const charges = [{ id: 'c1', clientId: 'a', amount: 300_000 }]

    const plan = planAttendanceUpdate(old, rows, { charges, activeSubFor: noSub })

    expect(plan.chargesToDelete).toEqual(['c1'])
    expect(plan.attendance[0].amountCharged).toBe(0)
  })

  it('сумму вписали там, где её не было — начисление создаётся', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amountCharged: 0 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amount: '200000' }]

    const plan = planAttendanceUpdate(old, rows, { charges: [], activeSubFor: noSub })

    expect(plan.chargesToCreate).toEqual([{ clientId: 'a', clientName: 'Аня', amount: 200_000 }])
  })

  it('платный пропуск: ученика не было, но деньги списаны', () => {
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amount: '330000' }]
    const plan = planAttendanceUpdate([], rows, { charges: [], activeSubFor: noSub })

    expect(plan.attendance[0].status).toBe('absent')
    expect(plan.attendance[0].amountCharged).toBe(330_000)
    expect(plan.chargesToCreate).toHaveLength(1)
  })

  it('прощённый пропуск: был отсутствующим и без суммы — начислений нет', () => {
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amount: '' }]
    const plan = planAttendanceUpdate([], rows, { charges: [], activeSubFor: noSub })

    expect(plan.chargesToCreate).toEqual([])
    expect(plan.attendance[0].amountCharged).toBe(0)
  })

  it('ученика убрали из состава — его начисление не остаётся сиротой', () => {
    const old = [
      { clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 },
      { clientId: 'b', clientName: 'Боря', status: 'present', amountCharged: 300_000 },
    ]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amount: '300000' }]
    const charges = [
      { id: 'c1', clientId: 'a', amount: 300_000 },
      { id: 'c2', clientId: 'b', amount: 300_000 },
    ]

    const plan = planAttendanceUpdate(old, rows, { charges, activeSubFor: noSub })

    expect(plan.chargesToDelete).toEqual(['c2'])
    expect(plan.attendance).toHaveLength(1)
  })

  it('абонемент помечается только у пришедшего: пропуск урок с пакета не списывает', () => {
    const rows = [
      { clientId: 'a', clientName: 'Аня', status: 'present', amount: '330000' },
      { clientId: 'b', clientName: 'Боря', status: 'absent', amount: '330000' },
    ]
    const plan = planAttendanceUpdate([], rows, { charges: [], activeSubFor: () => 'sub-1' })

    expect(plan.attendance[0].subscriptionId).toBe('sub-1')
    expect(plan.attendance[1].subscriptionId).toBeUndefined()
  })

  it('сумма не изменилась — ничего не трогаем', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amount: '300000' }]
    const charges = [{ id: 'c1', clientId: 'a', amount: 300_000 }]

    const plan = planAttendanceUpdate(old, rows, { charges, activeSubFor: noSub })

    expect(plan.chargesToCreate).toEqual([])
    expect(plan.chargesToUpdate).toEqual([])
    expect(plan.chargesToDelete).toEqual([])
  })

  it('журнал и начисления сходятся по сумме после любой правки', () => {
    const old = [
      { clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 },
      { clientId: 'b', clientName: 'Боря', status: 'present', amountCharged: 300_000 },
    ]
    const rows = [
      { clientId: 'a', clientName: 'Аня', status: 'present', amount: '350000' },   // обновится
      { clientId: 'b', clientName: 'Боря', status: 'absent', amount: '' },         // удалится
      { clientId: 'c', clientName: 'Вика', status: 'present', amount: '200000' },  // создастся
    ]
    const charges = [
      { id: 'c1', clientId: 'a', amount: 300_000 },
      { id: 'c2', clientId: 'b', amount: 300_000 },
    ]

    const plan = planAttendanceUpdate(old, rows, { charges, activeSubFor: noSub })

    // Сумма в журнале...
    const journal = plan.attendance.reduce((sum, a) => sum + a.amountCharged, 0)

    // ...и сумма начислений после применения плана должны совпасть.
    const deleted = new Set(plan.chargesToDelete)
    const updated = new Map(plan.chargesToUpdate.map(c => [c.id, c.amount]))
    const afterCharges = charges
      .filter(c => !deleted.has(c.id))
      .reduce((sum, c) => sum + (updated.get(c.id) ?? c.amount), 0)
      + plan.chargesToCreate.reduce((sum, c) => sum + c.amount, 0)

    expect(journal).toBe(550_000)
    expect(afterCharges).toBe(journal)
  })
})

describe('journalToAttendance', () => {
  it('пустая сумма — ноль, а не NaN', () => {
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amount: '' }]
    expect(journalToAttendance(rows)[0].amountCharged).toBe(0)
  })
})

describe('buildJournal — состав занятия', () => {
  it('у нового занятия все отмечены пришедшими, сумма подсказана', () => {
    const lesson = { studentIds: ['a'], attendance: [], status: 'planned' }
    const clients = [{ id: 'a', childName: 'Аня', lessonPrice: 250_000 }]

    const [row] = buildJournal(lesson, clients, [])

    expect(row.clientId).toBe('a')
    expect(row.status).toBe('present')
    // Сумма — строка: она едет прямо в поле ввода журнала.
    expect(Number(row.amount)).toBe(250_000)
  })

  it('у проведённого — берётся то, что записано в журнале', () => {
    const lesson = {
      studentIds: ['a'],
      status: 'conducted',
      attendance: [{ clientId: 'a', clientName: 'Аня', status: 'absent', amountCharged: 100_000 }],
    }
    const [row] = buildJournal(lesson, [{ id: 'a', childName: 'Аня' }], [])

    expect(row.status).toBe('absent')
    expect(Number(row.amount)).toBe(100_000)
  })
})

describe('attendanceTile — плитка виджета посещений', () => {
  const tile = (lesson) => attendanceTile(lesson, 'a')

  it('проведён и оплачен — зелёный', () => {
    const t = tile({
      status: 'conducted', date: '2026-07-01',
      attendance: [{ clientId: 'a', status: 'present', amountCharged: 330_000 }],
    })
    expect(t.icon).toBe('✓')
    expect(t.background).toBe('#dcfce7')
  })

  it('пропуск — жёлтый крестик', () => {
    const t = tile({
      status: 'conducted', date: '2026-07-01',
      attendance: [{ clientId: 'a', status: 'absent', amountCharged: 0 }],
    })
    expect(t.icon).toBe('✗')
  })

  it('отменённое — зачёркнуто', () => {
    const t = tile({ status: 'cancelled', date: '2026-07-01', attendance: [] })
    expect(t.strike).toBe(true)
  })
})
