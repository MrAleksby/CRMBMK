import { describe, it, expect } from 'vitest'
import { planScheduleChange } from './group'

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
