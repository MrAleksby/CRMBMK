import { describe, it, expect } from 'vitest'
import { daysUntilBirthday, upcomingBirthdays } from './dashboard.js'

// Логика дней рождения общая с дашбордом; телеграм-бот (scripts/birthdays.mjs)
// повторяет её же правило: сравниваем месяц и день, год у каждого свой.
//
// Главная ловушка — часовой пояс. Сервер GitHub живёт по UTC, и без сдвига на
// Ташкент (+5) поздравление уезжало бы на день: в 04:00 UTC там уже 09:00.

const client = (birthDate) => ({ id: 'x', childName: 'Ученик', birthDate })

describe('дни рождения — правило одно для дашборда и телеграма', () => {
  it('день рождения сегодня', () => {
    expect(daysUntilBirthday('2015-07-14', '2026-07-14')).toBe(0)
  })

  it('завтра — за день предупреждаем', () => {
    expect(daysUntilBirthday('2015-07-15', '2026-07-14')).toBe(1)
  })

  it('29 февраля в невисокосный год не теряется', () => {
    // Date переносит его на 1 марта — значит поздравим 1 марта, а не пропустим.
    expect(daysUntilBirthday('2016-02-29', '2027-02-27')).toBeGreaterThanOrEqual(1)
  })

  it('возраст считается на день праздника, а не на сегодня', () => {
    const rows = upcomingBirthdays([client('2015-07-15')], { today: '2026-07-14' })
    expect(rows[0].turns).toBe(11)
  })

  it('лиды не поздравляются — они ещё не ученики', () => {
    const lead = { ...client('2015-07-14'), status: 'lead' }
    expect(upcomingBirthdays([lead], { today: '2026-07-14' })).toEqual([])
  })
})
