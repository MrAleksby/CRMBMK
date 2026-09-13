import { describe, it, expect } from 'vitest'
import {
  planScheduleChange, generateDates, groupPeriods, groupToForm,
  formToGroupDoc, emptyGroupForm, validateGroupForm, periodLabel,
} from './group'

// Период группы правится и тогда, когда занятия уже проведены. Раньше
// расписание замораживалось целиком, и группу, которая больше не ведётся,
// нельзя было закрыть датой: приходилось отменять занятия по одному.

const lesson = (date, status = 'planned') => ({ id: `l-${date}-${status}`, date, status })

describe('изменение расписания группы', () => {
  it('лишние запланированные занятия удаляются', () => {
    const lessons = [lesson('2026-09-06'), lesson('2026-09-13'), lesson('2026-09-20')]
    const plan = planScheduleChange(lessons, ['2026-09-06'])

    expect(plan.toDelete.map(l => l.date)).toEqual(['2026-09-13', '2026-09-20'])
    expect(plan.toCreate).toEqual([])
  })

  it('недостающие создаются', () => {
    const plan = planScheduleChange([lesson('2026-09-06')], ['2026-09-06', '2026-09-13'])

    expect(plan.toCreate).toEqual(['2026-09-13'])
    expect(plan.toDelete).toEqual([])
  })

  it('проведённые не трогаются ни при каких правках', () => {
    const lessons = [lesson('2026-09-06', 'conducted'), lesson('2026-09-13')]
    const plan = planScheduleChange(lessons, ['2026-10-04'])

    expect(plan.toDelete.map(l => l.date)).toEqual(['2026-09-13'])
    expect(plan.toCreate).toEqual(['2026-10-04'])
  })

  it('на дату проведённого занятия дубль не создаётся', () => {
    const lessons = [lesson('2026-09-06', 'conducted')]
    const plan = planScheduleChange(lessons, ['2026-09-06', '2026-09-13'])

    expect(plan.toCreate).toEqual(['2026-09-13'])
  })

  it('совпавшие занятия остаются со своим составом', () => {
    const lessons = [{ id: 'l1', date: '2026-09-06', status: 'planned', studentIds: ['a'] }]
    const plan = planScheduleChange(lessons, ['2026-09-06'])

    expect(plan.kept).toBe(1)
    expect(plan.toDelete).toEqual([])
    expect(plan.toCreate).toEqual([])
  })

  it('прошедшие, но не проведённые занятия тоже убираются', () => {
    // Ровно то, ради чего всё затевалось: группа больше не ведётся, период
    // закрывают вчерашним днём, и висящие в календаре занятия исчезают.
    const lessons = [lesson('2026-08-01'), lesson('2026-08-08')]
    const plan = planScheduleChange(lessons, [])

    expect(plan.toDelete).toHaveLength(2)
  })

  it('отменённое занятие место не занимает и заново не создаётся', () => {
    const lessons = [lesson('2026-09-06', 'cancelled')]
    const plan = planScheduleChange(lessons, ['2026-09-06'])

    expect(plan.toCreate).toEqual([])
    expect(plan.toDelete).toEqual([])
  })

  it('дубль запланированных на одну дату схлопывается', () => {
    const lessons = [lesson('2026-09-06'), { ...lesson('2026-09-06'), id: 'dup' }]
    const plan = planScheduleChange(lessons, ['2026-09-06'])

    expect(plan.toDelete.map(l => l.id)).toEqual(['dup'])
  })
})

// Каникулярная группа идёт окнами: лето, осенние, зимние каникулы, между ними
// пауза. Одним отрезком это не описать, поэтому периодов у группы несколько.
describe('несколько периодов у группы', () => {
  const weekly = (periods) => ({
    mode: 'weekly', weekdays: [7], periods,   // воскресенья
  })

  it('занятия создаются внутри каждого окна, между ними пусто', () => {
    const dates = generateDates(weekly([
      { from: '2026-06-21', to: '2026-07-05' },
      { from: '2026-11-01', to: '2026-11-08' },
    ]))

    expect(dates).toEqual(['2026-06-21', '2026-06-28', '2026-07-05', '2026-11-01', '2026-11-08'])
  })

  it('в учебное время между окнами занятий нет', () => {
    const dates = generateDates(weekly([{ from: '2026-06-21', to: '2026-07-05' }]))
    expect(dates.some(d => d > '2026-07-05')).toBe(false)
  })

  it('пересечение периодов не плодит дубли', () => {
    const dates = generateDates(weekly([
      { from: '2026-06-21', to: '2026-07-05' },
      { from: '2026-06-28', to: '2026-07-12' },
    ]))

    expect(dates).toEqual(['2026-06-21', '2026-06-28', '2026-07-05', '2026-07-12'])
  })

  it('старая группа с одним периодом читается как раньше', () => {
    const group = { dateFrom: '2026-06-21', dateTo: '2026-07-05', mode: 'weekly', weekdays: [7] }

    expect(groupPeriods(group)).toEqual([{ from: '2026-06-21', to: '2026-07-05' }])
    expect(generateDates(groupToForm(group))).toHaveLength(3)
  })

  it('документ хранит периоды и границы всей серии', () => {
    const doc = formToGroupDoc({
      ...emptyGroupForm(),
      name: 'Каникулы',
      mode: 'weekly',
      weekdays: [7],
      periods: [
        { from: '2026-11-01', to: '2026-11-08' },
        { from: '2026-06-21', to: '2026-07-05' },
      ],
    })

    expect(doc.periods).toEqual([
      { from: '2026-06-21', to: '2026-07-05' },
      { from: '2026-11-01', to: '2026-11-08' },
    ])
    expect(doc.dateFrom).toBe('2026-06-21')
    expect(doc.dateTo).toBe('2026-11-08')
  })

  it('возобновление добавляет занятия, не трогая прошедшие', () => {
    // Летние занятия проведены, группа возобновляется на осенние каникулы.
    const lessons = [
      { id: 'l1', date: '2026-06-21', status: 'conducted' },
      { id: 'l2', date: '2026-06-28', status: 'conducted' },
    ]
    const dates = generateDates(weekly([
      { from: '2026-06-21', to: '2026-06-28' },
      { from: '2026-11-01', to: '2026-11-08' },
    ]))
    const plan = planScheduleChange(lessons, dates)

    expect(plan.toDelete).toEqual([])
    expect(plan.toCreate).toEqual(['2026-11-01', '2026-11-08'])
  })

  it('период без даты начала не проходит проверку', () => {
    const form = { ...emptyGroupForm(), name: 'Группа', periods: [{ from: '', to: '' }] }
    expect(validateGroupForm(form)).toBe('Укажите период занятий')
  })

  it('конец раньше начала не проходит проверку', () => {
    const form = {
      ...emptyGroupForm(), name: 'Группа',
      periods: [{ from: '2026-07-01', to: '2026-06-01' }],
    }
    expect(validateGroupForm(form)).toMatch(/раньше/)
  })

  it('в подписи больше двух периодов сворачиваются', () => {
    const group = { periods: [
      { from: '2026-06-21', to: '2026-07-05' },
      { from: '2026-11-01', to: '2026-11-08' },
      { from: '2027-01-03', to: '2027-01-10' },
    ] }
    expect(periodLabel(group)).toMatch(/и ещё 2/)
  })
})
