import { describe, it, expect } from 'vitest'
import {
  monthlyMoney, monthlyStudents, monthlyLessons, teacherReport,
  debtorsReport, accountsReport, salaryReport, presetRange,
} from './reports'
import { companyBalance } from './finance'
import { lessonsLeft } from './subscription'

// Отчёты обязаны сходиться с «Финансами» до копейки: считают они то же самое,
// просто в другом разрезе. Любое расхождение — это ошибка в отчёте, а не «другой взгляд».

const day = (iso) => new Date(`${iso}T12:00:00`)
const tx = (kind, amount, iso, over = {}) => ({
  kind, amount, date: day(iso), accountId: 'cash', categoryId: 'cat', ...over,
})
const charge = (clientId, amount, iso) => ({ clientId, amount, lessons: 1, date: day(iso) })

const RANGE = { from: '2026-01-01', to: '2026-12-31' }

describe('monthlyMoney', () => {
  const transactions = [
    tx('income', 1_000_000, '2026-01-10', { clientId: 'a' }),
    tx('expense', 200_000, '2026-01-20'),
    tx('salary', 300_000, '2026-02-05'),
    tx('refund', 50_000, '2026-02-10', { clientId: 'a' }),
  ]
  const charges = [charge('a', 330_000, '2026-01-15'), charge('a', 330_000, '2026-02-15')]

  it('раскладывает деньги по месяцам', () => {
    const rows = monthlyMoney(transactions, charges, RANGE)
    const jan = rows.find(r => r.key === '2026-01')
    const feb = rows.find(r => r.key === '2026-02')

    expect(jan.income).toBe(1_000_000)
    expect(jan.expense).toBe(200_000)
    expect(jan.charged).toBe(330_000)
    expect(feb.salary).toBe(300_000)
    expect(feb.refund).toBe(50_000)
  })

  it('прибыль = списано − расходы − ЗП, а не «доходы − расходы»', () => {
    // Иначе месяц с крупной предоплатой показал бы прибыль, которой ещё не заработали.
    const rows = monthlyMoney(transactions, charges, RANGE)
    const jan = rows.find(r => r.key === '2026-01')

    expect(jan.profit).toBe(330_000 - 200_000)
    expect(jan.profit).not.toBe(jan.income - jan.expense)
  })

  // Турниры и кешбеки денег приносят, а начислений не имеют: считать прибыль
  // только по занятиям — значит потерять их (на июль 2026 это 32,5 млн).
  it('доход без ученика входит в прибыль напрямую', () => {
    const withTournament = [...transactions, tx('income', 500_000, '2026-01-25')]
    const rows = monthlyMoney(withTournament, charges, RANGE)
    const jan = rows.find(r => r.key === '2026-01')

    expect(jan.otherIncome).toBe(500_000)
    expect(jan.profit).toBe(330_000 + 500_000 - 200_000)
  })

  it('«осталось» = прибыль минус изъятия, минус — вывели больше, чем заработали', () => {
    const withDraw = [...transactions, tx('draw', 500_000, '2026-01-28')]
    const rows = monthlyMoney(withDraw, charges, RANGE)
    const jan = rows.find(r => r.key === '2026-01')

    expect(jan.profit).toBe(130_000)
    expect(jan.retained).toBe(130_000 - 500_000)
  })

  it('оплата ученика в прибыль напрямую не идёт — её приносит занятие', () => {
    const rows = monthlyMoney(transactions, charges, RANGE)
    const jan = rows.find(r => r.key === '2026-01')

    expect(jan.income).toBe(1_000_000)   // предоплата за абонемент
    expect(jan.otherIncome).toBe(0)
    expect(jan.profit).toBe(130_000)     // только проведённое занятие
  })

  it('фильтр по кассе не тянет чужие операции', () => {
    const list = [tx('income', 100, '2026-03-01', { accountId: 'cash' }), tx('income', 900, '2026-03-01', { accountId: 'card' })]
    const rows = monthlyMoney(list, [], RANGE, { accountId: 'card' })
    expect(rows.find(r => r.key === '2026-03').income).toBe(900)
  })

  it('при фильтре по кассе списания не считаются: у них кассы нет', () => {
    const rows = monthlyMoney(transactions, charges, RANGE, { accountId: 'cash' })
    expect(rows.every(r => r.charged === 0)).toBe(true)
  })

  it('операции вне периода не попадают', () => {
    const list = [tx('income', 999, '2025-12-31'), tx('income', 111, '2026-01-01')]
    const rows = monthlyMoney(list, [], { from: '2026-01-01', to: '2026-01-31' })
    expect(rows.reduce((s, r) => s + r.income, 0)).toBe(111)
  })
})

describe('accountsReport', () => {
  it('ИНВАРИАНТ: сумма остатков по кассам = баланс компании', () => {
    const accounts = [{ id: 'cash', name: 'Наличные' }, { id: 'card', name: 'Карта' }]
    const list = [
      tx('income', 5_000_000, '2026-01-10', { accountId: 'cash' }),
      tx('income', 3_000_000, '2026-02-10', { accountId: 'card' }),
      tx('expense', 1_000_000, '2026-03-10', { accountId: 'cash' }),
      tx('salary', 500_000, '2026-04-10', { accountId: 'card' }),
    ]

    const rows = accountsReport(list, accounts, RANGE)
    const sum = rows.reduce((total, a) => total + a.total, 0)

    expect(sum).toBe(companyBalance(list))
  })

  it('остаток считается за всё время, даже если период узкий', () => {
    const accounts = [{ id: 'cash', name: 'Наличные' }]
    const list = [tx('income', 1_000_000, '2026-01-10'), tx('expense', 400_000, '2026-06-10')]

    // Период — только январь, но касса не обнуляется первого числа.
    const [cash] = accountsReport(list, accounts, { from: '2026-01-01', to: '2026-01-31' })

    expect(cash.income).toBe(1_000_000)   // приход — за период
    expect(cash.outcome).toBe(0)
    expect(cash.total).toBe(600_000)      // остаток — за всё время
  })
})

describe('debtorsReport', () => {
  const clients = [
    { id: 'a', childName: 'Аня', status: 'active' },
    { id: 'b', childName: 'Боря', status: 'active' },
    { id: 'c', childName: 'Вика', status: 'active' },
    { id: 'lead', childName: 'Лид', status: 'lead' },
  ]
  const transactions = [
    tx('income', 100_000, '2026-06-01', { clientId: 'a' }),
    tx('income', 990_000, '2026-06-02', { clientId: 'b' }),
    tx('income', 500_000, '2026-06-03', { clientId: 'lead' }),
  ]
  const charges = [charge('a', 330_000, '2026-06-10'), charge('lead', 200_000, '2026-06-11')]

  it('должники идут первыми, с самым крупным долгом сверху', () => {
    const rows = debtorsReport(clients, transactions, charges, [], lessonsLeft)
    expect(rows[0].name).toBe('Аня')
    expect(rows[0].balance).toBe(-230_000)
  })

  it('ученики с нулевым балансом не показываются', () => {
    const rows = debtorsReport(clients, transactions, charges, [], lessonsLeft)
    expect(rows.find(r => r.id === 'c')).toBeUndefined()
  })

  it('карточки лидов в список не попадают', () => {
    const rows = debtorsReport(clients, transactions, charges, [], lessonsLeft)
    expect(rows.find(r => r.id === 'lead')).toBeUndefined()
  })

  it('дата последней оплаты — самая свежая', () => {
    const list = [
      tx('income', 100, '2026-05-01', { clientId: 'a' }),
      tx('income', 100, '2026-07-09', { clientId: 'a' }),
    ]
    const rows = debtorsReport(clients, list, [charge('a', 1_000, '2026-07-10')], [], lessonsLeft)
    expect(rows.find(r => r.id === 'a').lastPayment).toBe('2026-07-09')
  })
})

describe('salaryReport', () => {
  it('считает выплаты каждому и стоимость одного занятия', () => {
    const teachers = [{ id: 't1', name: 'Педагог' }]
    const transactions = [
      tx('salary', 1_000_000, '2026-06-01', { teacherId: 't1' }),
      tx('salary', 500_000, '2026-06-10', { teacherId: 't1' }),
      tx('expense', 999_999, '2026-06-10', { teacherId: 't1' }),   // не зарплата
    ]
    const lessons = [
      { id: 'l1', teacherId: 't1', status: 'conducted', date: '2026-06-05', attendance: [] },
      { id: 'l2', teacherId: 't1', status: 'conducted', date: '2026-06-12', attendance: [] },
      { id: 'l3', teacherId: 't1', status: 'planned', date: '2026-06-20', attendance: [] },
    ]

    const [row] = salaryReport(transactions, lessons, teachers, RANGE)

    expect(row.payments).toBe(2)
    expect(row.total).toBe(1_500_000)
    expect(row.lessons).toBe(2)             // запланированное не в счёт
    expect(row.perLesson).toBe(750_000)
  })

  it('выплаты без педагога показываются отдельно, иначе сумма не сойдётся', () => {
    const transactions = [tx('salary', 300_000, '2026-06-01')]
    const rows = salaryReport(transactions, [], [], RANGE)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('(педагог не указан)')
    expect(rows[0].total).toBe(300_000)
  })
})

describe('monthlyStudents — отток', () => {
  const clients = [{ id: 'a', childName: 'Аня' }, { id: 'b', childName: 'Боря' }]
  const lesson = (iso, ids) => ({
    id: iso, status: 'conducted', date: iso,
    attendance: ids.map(id => ({ clientId: id, status: 'present' })),
  })

  it('ушёл — ходил в прошлом месяце и не пришёл в этом', () => {
    const lessons = [lesson('2026-01-10', ['a', 'b']), lesson('2026-02-10', ['a'])]
    const rows = monthlyStudents(clients, lessons, [], { from: '2026-01-01', to: '2026-03-31' })

    const feb = rows.find(r => r.key === '2026-02')
    expect(feb.active).toBe(1)
    expect(feb.churned).toBe(1)     // Боря
  })

  it('за текущий месяц отток не считается: он ещё не кончился', () => {
    const now = new Date()
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 10)
    const prevIso = prev.toISOString().slice(0, 10)

    const lessons = [lesson(prevIso, ['a', 'b'])]
    const rows = monthlyStudents(clients, lessons, [], {
      from: `${prevIso.slice(0, 7)}-01`, to: `${iso}-28`,
    })

    expect(rows.find(r => r.key === iso).churned).toBe(0)
  })
})

describe('monthlyLessons и teacherReport', () => {
  const lessons = [
    {
      id: 'l1', teacherId: 't1', groupId: 'g1', type: 'group', status: 'conducted', date: '2026-06-05',
      attendance: [{ clientId: 'a', status: 'present' }, { clientId: 'b', status: 'absent' }],
    },
    { id: 'l2', teacherId: 't2', groupId: 'g2', type: 'group', status: 'conducted', date: '2026-06-06', attendance: [] },
    { id: 'l3', teacherId: 't1', groupId: 'g1', type: 'group', status: 'cancelled', date: '2026-06-07', attendance: [] },
  ]
  const charges = [charge('a', 330_000, '2026-06-05')]

  it('считает посещения и пропуски', () => {
    const rows = monthlyLessons(lessons, charges, RANGE)
    const june = rows.find(r => r.key === '2026-06')

    expect(june.conducted).toBe(2)
    expect(june.cancelled).toBe(1)
    expect(june.present).toBe(1)
    expect(june.absent).toBe(1)
  })

  it('фильтр по педагогу оставляет только его занятия', () => {
    const rows = monthlyLessons(lessons, charges, RANGE, { teacherId: 't2' })
    const june = rows.find(r => r.key === '2026-06')

    expect(june.conducted).toBe(1)
    // Списание принадлежит чужому занятию — в отфильтрованный отчёт не попадает.
    expect(june.charged).toBe(0)
  })

  it('teacherReport: занятия и начисления по педагогу', () => {
    const withLessonId = [{ ...charge('a', 330_000, '2026-06-05'), lessonId: 'l1' }]
    const rows = teacherReport(lessons, withLessonId, [{ id: 't1', name: 'Первый' }], RANGE)

    expect(rows[0].lessons).toBe(1)
    expect(rows[0].present).toBe(1)
    expect(rows[0].absent).toBe(1)
    expect(rows[0].earned).toBe(330_000)
  })
})

describe('presetRange', () => {
  const today = new Date('2026-07-12T12:00:00')

  it('этот месяц', () => {
    expect(presetRange('month', today)).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('прошлый месяц', () => {
    expect(presetRange('prev', today)).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  })

  it('квартал — с июля по сентябрь', () => {
    expect(presetRange('quarter', today)).toEqual({ from: '2026-07-01', to: '2026-09-30' })
  })

  it('год', () => {
    expect(presetRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})
