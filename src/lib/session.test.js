// Выход из системы стирает копию данных с диска браузера.
//
// В копии лежат имена детей, телефоны родителей и все деньги. Если «Выйти»
// её не стирает, данные остаются на устройстве после ухода человека.
//
// Второе требование не менее важное: сам выход обязан состояться в любом случае.
// Не стёрлась копия, не отработал signOut — человек всё равно должен выйти,
// иначе он останется внутри системы, думая, что вышел.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls = []
let signOutFails = false
let clearFails = false

vi.mock('../firebase', () => ({ auth: { __auth: true }, db: { __db: true } }))

vi.mock('firebase/auth', () => ({
  signOut: async () => {
    calls.push('signOut')
    if (signOutFails) throw Object.assign(new Error('сеть'), { code: 'unavailable' })
  },
}))

vi.mock('firebase/firestore', () => ({
  terminate: async () => { calls.push('terminate') },
  clearIndexedDbPersistence: async () => {
    calls.push('clear')
    if (clearFails) throw Object.assign(new Error('открыта вторая вкладка'), { code: 'failed-precondition' })
  },
}))

vi.mock('./store', () => ({ stopAllLive: () => calls.push('stopAllLive') }))

const { logout } = await import('./session')

beforeEach(() => {
  calls.length = 0
  signOutFails = false
  clearFails = false
  vi.stubGlobal('window', { location: { replace: (url) => calls.push(`replace:${url}`) } })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('выход из системы', () => {
  it('стирает копию данных с диска и перезагружает страницу', async () => {
    await logout()

    expect(calls).toEqual(['signOut', 'stopAllLive', 'terminate', 'clear', 'replace:/'])
  })

  it('копию стирает только у остановленного Firestore', async () => {
    // clearIndexedDbPersistence на работающем экземпляре просто откажет,
    // и копия осталась бы на диске.
    await logout()

    expect(calls.indexOf('terminate')).toBeLessThan(calls.indexOf('clear'))
  })

  it('подписки закрываются до остановки Firestore', async () => {
    // Переживший выход слушатель получит отказ по правам и засорит консоль.
    await logout()

    expect(calls.indexOf('stopAllLive')).toBeLessThan(calls.indexOf('terminate'))
  })

  it('не смогли стереть копию — выход всё равно завершается', async () => {
    clearFails = true

    await logout()

    // Так бывает, когда открыта вторая вкладка: Firestore не даёт стереть
    // общую копию из-под неё. Держать человека внутри из-за этого нельзя.
    expect(calls).toContain('replace:/')
  })

  it('отвалилась сеть — выход всё равно завершается', async () => {
    signOutFails = true

    await logout()

    expect(calls).toContain('stopAllLive')
    expect(calls).toContain('replace:/')
  })
})
