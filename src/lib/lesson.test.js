import { describe, it, expect } from 'vitest'
import { planAttendanceUpdate, buildJournal, journalToAttendance, attendanceTile, attendanceToRow, journalTotal, validateJournal, rowTotal, splitFields, journalProblems, rowBonus, journalBonusTotal
} from './lesson'

// Правка журнала проведённого занятия — самое опасное место в системе: сумма
// живёт в двух коллекциях сразу (lessons.attendance и charges). Если они разойдутся,
// баланс ученика перестанет сходиться с журналом, и заметят это не скоро.
//
// planAttendanceUpdate строит план правки; применяет его одна транзакция writeBatch.

const noSub = () => null

describe('planAttendanceUpdate', () => {
  it('сумма выросла — начисление обновляется, а не дублируется', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '350000' }]
    const charges = [{ id: 'c1', clientId: 'a', amount: 300_000 }]

    const plan = planAttendanceUpdate(old, rows, { charges, activeSubFor: noSub })

    expect(plan.chargesToUpdate).toEqual([
      { id: 'c1', amount: 350_000, comment: '' },
    ])
    expect(plan.chargesToCreate).toEqual([])
    expect(plan.chargesToDelete).toEqual([])
    expect(plan.attendance[0].amountCharged).toBe(350_000)
  })

  it('сумму стёрли — начисление удаляется, долг снимается', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '' }]
    const charges = [{ id: 'c1', clientId: 'a', amount: 300_000 }]

    const plan = planAttendanceUpdate(old, rows, { charges, activeSubFor: noSub })

    expect(plan.chargesToDelete).toEqual(['c1'])
    expect(plan.attendance[0].amountCharged).toBe(0)
  })

  it('сумму вписали там, где её не было — начисление создаётся', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amountCharged: 0 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amountLesson: '200000' }]

    const plan = planAttendanceUpdate(old, rows, { charges: [], activeSubFor: noSub })

    expect(plan.chargesToCreate).toEqual([
      { clientId: 'a', clientName: 'Аня', amount: 200_000, comment: '' },
    ])
  })

  it('платный пропуск: ученика не было, но деньги списаны', () => {
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amountLesson: '330000' }]
    const plan = planAttendanceUpdate([], rows, { charges: [], activeSubFor: noSub })

    expect(plan.attendance[0].status).toBe('absent')
    expect(plan.attendance[0].amountCharged).toBe(330_000)
    expect(plan.chargesToCreate).toHaveLength(1)
  })

  it('прощённый пропуск: был отсутствующим и без суммы — начислений нет', () => {
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'absent', amountLesson: '' }]
    const plan = planAttendanceUpdate([], rows, { charges: [], activeSubFor: noSub })

    expect(plan.chargesToCreate).toEqual([])
    expect(plan.attendance[0].amountCharged).toBe(0)
  })

  it('ученика убрали из состава — его начисление не остаётся сиротой', () => {
    const old = [
      { clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 },
      { clientId: 'b', clientName: 'Боря', status: 'present', amountCharged: 300_000 },
    ]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '300000' }]
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
      { clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '330000' },
      { clientId: 'b', clientName: 'Боря', status: 'absent', amountLesson: '330000' },
    ]
    const plan = planAttendanceUpdate([], rows, { charges: [], activeSubFor: () => 'sub-1' })

    expect(plan.attendance[0].subscriptionId).toBe('sub-1')
    expect(plan.attendance[1].subscriptionId).toBeUndefined()
  })

  it('сумма не изменилась — ничего не трогаем', () => {
    const old = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 }]
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '300000' }]
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
      { clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '350000' },   // обновится
      { clientId: 'b', clientName: 'Боря', status: 'absent', amountLesson: '' },         // удалится
      { clientId: 'c', clientName: 'Вика', status: 'present', amountLesson: '200000' },  // создастся
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
    const rows = [{ clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '' }]
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
    expect(Number(row.amountLesson)).toBe(250_000)
  })

  it('у проведённого — берётся то, что записано в журнале', () => {
    const lesson = {
      studentIds: ['a'],
      status: 'conducted',
      attendance: [{ clientId: 'a', clientName: 'Аня', status: 'absent', amountCharged: 100_000 }],
    }
    const [row] = buildJournal(lesson, [{ id: 'a', childName: 'Аня' }], [])

    expect(row.status).toBe('absent')
    expect(Number(row.amountLesson)).toBe(100_000)
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

// Сумма занятия делится на занятие и питание. В кассу и на лицевой счёт уходит
// ИТОГ: все расчёты читают его и о разбивке знать не обязаны. Ошибка здесь
// разъедет журнал с начислениями — то есть покажет неправду про долг ребёнка.
describe('разделение суммы: занятие и питание', () => {
  const row = (over = {}) => ({
    clientId: 'a', clientName: 'Аня', status: 'present',
    amountLesson: '300000', amountMeal: '30000', comment: '', ...over,
  })

  it('на лицевой счёт уходит итог, а не одна из частей', () => {
    expect(rowTotal(row())).toBe(330_000)
    expect(journalToAttendance([row()])[0].amountCharged).toBe(330_000)
    expect(journalTotal([row(), row({ clientId: 'b' })])).toBe(660_000)
  })

  it('разбивка и комментарий доезжают до журнала', () => {
    const record = journalToAttendance([row({ comment: ' доел добавку ' })])[0]
    expect(record.amountLesson).toBe(300_000)
    expect(record.amountMeal).toBe(30_000)
    expect(record.comment).toBe('доел добавку')
  })

  it('запятая в любой из частей понимается как десятичный разделитель', () => {
    expect(rowTotal(row({ amountLesson: '300000', amountMeal: '1,5' }))).toBe(300_001.5)
  })

  it('одно питание без занятия — тоже допустимая запись', () => {
    const only = row({ amountLesson: '', amountMeal: '30000' })
    expect(validateJournal([only])).toBeNull()
    expect(rowTotal(only)).toBe(30_000)
  })

  it('пришедшему нужна хотя бы одна сумма', () => {
    expect(validateJournal([row({ amountLesson: '', amountMeal: '' })]))
      .toBe('«Аня» — сумма не указана')
  })

  it('отрицательное питание не принимается', () => {
    expect(validateJournal([row({ amountMeal: '-100' })]))
      .toContain('питание')
  })

  it('отсутствующему обе суммы можно оставить пустыми — пропуск прощён', () => {
    const skipped = row({ status: 'absent', amountLesson: '', amountMeal: '' })
    expect(validateJournal([skipped])).toBeNull()
    expect(journalToAttendance([skipped])[0].amountCharged).toBe(0)
  })
})

describe('проведённые до разделения занятия остаются как есть', () => {
  // В старых суммах питание уже сидело внутри. Дописать им «питание 0» значило бы
  // соврать, поэтому разбивка появляется только там, где менеджер её задал сам.
  const oldRecord = { clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 330_000 }

  it('старая запись открывается одной суммой в «Занятии», питание пустое', () => {
    const row = attendanceToRow(oldRecord)
    expect(row.amountLesson).toBe('330000')
    expect(row.amountMeal).toBe('')
    expect(rowTotal(row)).toBe(330_000)
  })

  it('пересохранение старого журнала не выдумывает разбивку и не трогает начисление', () => {
    const rows = [attendanceToRow(oldRecord)]
    const plan = planAttendanceUpdate([oldRecord], rows, {
      charges: [{ id: 'c1', clientId: 'a', amount: 330_000 }],
      activeSubFor: () => null,
    })

    expect(plan.chargesToUpdate).toEqual([])
    expect(plan.chargesToDelete).toEqual([])
    expect(plan.attendance[0].amountCharged).toBe(330_000)
    expect(plan.attendance[0].amountMeal).toBeUndefined()
  })

  it('но если менеджер РАЗДЕЛИЛ старую сумму — начисление обновляется, итог тот же', () => {
    const rows = [{ ...attendanceToRow(oldRecord), amountLesson: '300000', amountMeal: '30000' }]
    const plan = planAttendanceUpdate([oldRecord], rows, {
      charges: [{ id: 'c1', clientId: 'a', amount: 330_000 }],
      activeSubFor: () => null,
    })

    expect(plan.chargesToUpdate).toEqual([
      { id: 'c1', amount: 330_000, amountLesson: 300_000, amountMeal: 30_000, comment: '' },
    ])
    // Итог не изменился — значит баланс ребёнка не поехал.
    expect(plan.attendance[0].amountCharged).toBe(330_000)
  })

  it('новая запись с разбивкой открывается обратно теми же частями', () => {
    const record = journalToAttendance([{
      clientId: 'a', clientName: 'Аня', status: 'present',
      amountLesson: '300000', amountMeal: '30000', comment: 'добавка',
    }])[0]
    const back = attendanceToRow(record)
    expect(back.amountLesson).toBe('300000')
    expect(back.amountMeal).toBe('30000')
    expect(back.comment).toBe('добавка')
  })
})

describe('документ начисления не содержит undefined', () => {
  // Firestore отвергает запись, где хоть одно поле undefined, — целиком, с ошибкой
  // «Unsupported field value». Занятие тогда не проводится вовсе. Поймано живым
  // прогоном в песочнице: у ученика без питания полей разбивки нет, и подстановка
  // record.amountLesson давала undefined.
  const chargeDoc = (row) => {
    const record = journalToAttendance([row])[0]
    return { amount: record.amountCharged, ...splitFields(record), comment: record.comment || '' }
  }
  const noUndefined = (obj) => Object.values(obj).every(v => v !== undefined)

  it('у ученика без питания разбивки в документе нет, а не undefined', () => {
    const doc = chargeDoc({ clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '300000', amountMeal: '' })
    expect(noUndefined(doc)).toBe(true)
    expect('amountLesson' in doc).toBe(false)
    expect(doc.amount).toBe(300_000)
  })

  it('у ученика с питанием разбивка есть и тоже без undefined', () => {
    const doc = chargeDoc({ clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '300000', amountMeal: '30000' })
    expect(noUndefined(doc)).toBe(true)
    expect(doc).toEqual({ amount: 330_000, amountLesson: 300_000, amountMeal: 30_000, comment: '' })
  })

  it('план правки журнала тоже не отдаёт undefined ни в создание, ни в обновление', () => {
    const plan = planAttendanceUpdate(
      [{ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 300_000 }],
      [
        { clientId: 'a', clientName: 'Аня', status: 'present', amountLesson: '350000', amountMeal: '' },
        { clientId: 'b', clientName: 'Боря', status: 'present', amountLesson: '200000', amountMeal: '' },
      ],
      { charges: [{ id: 'c1', clientId: 'a', amount: 300_000 }], activeSubFor: () => null },
    )
    for (const doc of [...plan.chargesToCreate, ...plan.chargesToUpdate, ...plan.attendance]) {
      expect(noUndefined(doc)).toBe(true)
    }
  })
})

// Менеджер заполняет журнал на двенадцать детей. Если проверка называет одного
// за раз, он исправляет, жмёт «Провести», получает следующего — и так по кругу,
// не зная, сколько их всего. Владелец на это и пожаловался 6 сентября.
describe('журнал называет всех незаполненных сразу', () => {
  const row = (name, over = {}) => ({
    clientId: name, clientName: name, status: 'present',
    amountLesson: '300000', amountMeal: '', comment: '', ...over,
  })

  it('перечисляет всех, у кого нет суммы, а не первого', () => {
    const rows = [
      row('Аня'),
      row('Боря', { amountLesson: '', amountMeal: '' }),
      row('Вика'),
      row('Гоша', { amountLesson: '', amountMeal: '' }),
    ]

    const message = validateJournal(rows)

    expect(message).toContain('«Боря»')
    expect(message).toContain('«Гоша»')
    expect(message).toContain('2')
    expect(message).not.toContain('«Аня»')
  })

  it('возвращает сами строки, чтобы подсветить их в списке', () => {
    const rows = [row('Аня'), row('Боря', { amountLesson: '', amountMeal: '' })]

    expect(journalProblems(rows).map(p => p.clientId)).toEqual(['Боря'])
  })

  it('отсутствующий без сумм проблемой не считается — пропуск прощён', () => {
    const rows = [row('Аня', { status: 'absent', amountLesson: '', amountMeal: '' })]

    expect(journalProblems(rows)).toEqual([])
    expect(validateJournal(rows)).toBeNull()
  })

  it('нечисловая сумма тоже попадает в список с указанием поля', () => {
    const rows = [row('Аня', { amountMeal: 'абв' })]

    expect(journalProblems(rows)[0].problem).toContain('питание')
  })
})

// Журнал рисуется в ДВУХ местах: на странице «Уроки» (LessonJournal) и в окне
// занятия из календаря (LessonModal). 6 сентября 2026 второе осталось со старым
// полем `amount`: менеджер вводил суммы, а проведение читало `amountLesson`
// и списало бы подставленную подсказку вместо введённого. Тест закрепляет
// договор о полях, чтобы расхождение было видно сразу.
describe('договор о полях строки журнала', () => {
  it('buildJournal отдаёт ровно те поля, к которым привязаны оба экрана', () => {
    const lesson = { studentIds: ['a'], attendance: [] }
    const row = buildJournal(lesson, [{ id: 'a', childName: 'Аня', lessonPrice: 300000 }], [])[0]

    expect(Object.keys(row).sort())
      .toEqual(['amountBonus', 'amountLesson', 'amountMeal', 'clientId', 'clientName', 'comment', 'status'])
    // Поля `amount` нет и быть не должно: кто на него смотрит — смотрит в пустоту.
    expect('amount' in row).toBe(false)
  })

  it('attendanceToRow отдаёт те же поля', () => {
    const row = attendanceToRow({ clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 330000 })

    expect(Object.keys(row).sort())
      .toEqual(['amountBonus', 'amountLesson', 'amountMeal', 'clientId', 'clientName', 'comment', 'status'])
  })
})

// Бонус — право на скидку, а не деньги. Поэтому он уменьшает сумму списания:
// школа получает меньше, и прибыль честно падает на подаренное. Противоположный
// путь — списать полную сумму и дорисовать «оплату бонусом» — завысил бы доход
// на деньги, которых никто не вносил.
describe('бонус в журнале', () => {
  const row = (extra) => ({
    clientId: 'a', clientName: 'Аня', status: 'present',
    amountLesson: '300000', amountMeal: '30000', amountBonus: '', comment: '', ...extra,
  })

  it('уменьшает сумму к списанию', () => {
    expect(rowTotal(row({ amountBonus: '50000' }))).toBe(280_000)
  })

  it('без бонуса считается как раньше', () => {
    expect(rowTotal(row())).toBe(330_000)
  })

  it('больше стоимости занятия не спишется — в минус не уходим', () => {
    expect(rowTotal(row({ amountBonus: '400000' }))).toBe(0)
    expect(rowBonus(row({ amountBonus: '400000' }))).toBe(330_000)
  })

  it('в записи журнала бонус лежит рядом, а на счёт уходит итог', () => {
    const [record] = journalToAttendance([row({ amountBonus: '50000' })])

    expect(record.amountCharged).toBe(280_000)
    expect(record.amountBonus).toBe(50_000)
    expect(record.amountLesson).toBe(300_000)
  })

  it('без бонуса поля в документе нет — Firestore не любит лишнего', () => {
    const [record] = journalToAttendance([row()])
    expect('amountBonus' in record).toBe(false)
  })

  it('сохранённая запись открывается с тем же бонусом', () => {
    const back = attendanceToRow({
      clientId: 'a', clientName: 'Аня', status: 'present',
      amountCharged: 280_000, amountLesson: 300_000, amountMeal: 30_000, amountBonus: 50_000,
    })

    expect(back.amountBonus).toBe('50000')
    expect(rowTotal(back)).toBe(280_000)
  })

  it('у старой записи без разбивки бонус не выдумывается', () => {
    const back = attendanceToRow({ clientId: 'a', clientName: 'Аня', amountCharged: 330_000 })

    expect(back.amountBonus).toBe('')
    expect(back.amountLesson).toBe('330000')
  })

  it('итог по занятию показывает, сколько подарено', () => {
    const rows = [row({ amountBonus: '50000' }), row({ clientId: 'b', amountBonus: '10000' })]

    expect(journalBonusTotal(rows)).toBe(60_000)
    expect(journalTotal(rows)).toBe(600_000)
  })

  it('чепуха в поле бонуса не проходит', () => {
    expect(validateJournal([row({ amountBonus: '-5' })])).toMatch(/бонус/)
  })
})
