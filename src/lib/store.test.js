// Живые подписки и точечное обновление.
//
// Этот слой отвечает за две вещи сразу: сколько система тратит обращений к базе
// (23 августа 2026 суточный лимит выбрали посреди рабочего дня) и что менеджер
// видит на экране после своей и чужой правки. Ошибка здесь не портит базу,
// но показывает неправду — поэтому тесты.

import { describe, it, expect, beforeEach, vi } from 'vitest'

let docs = {}          // фейковая база: id -> документ
let reads = 0          // сколько документов Firestore бы затарифицировал
let listeners = []

vi.mock('../firebase', () => ({ db: {}, auth: {} }))

const matching = (ref) => Object.entries(docs)
  .filter(([, d]) => d.__collection === ref.name)
  .filter(([, d]) => !ref.clientMoney || ['income', 'refund'].includes(d.kind))
  .map(([id, d]) => ({ id, data: () => d }))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name, clientMoney: false }),
  doc: (_db, name, id) => ({ name, id }),
  where: () => ({}),
  query: (ref) => ({ ...ref, clientMoney: true }),
  getDocs: async (ref) => { const rows = matching(ref); reads += rows.length; return { docs: rows } },
  getDoc: async (ref) => {
    reads += 1
    return { exists: () => Boolean(docs[ref.id]), id: ref.id, data: () => docs[ref.id] }
  },
  // Первый снимок тарифицируется целиком, дальнейшие — только изменённым.
  onSnapshot: (ref, onNext, onError) => {
    const listener = { ref, onNext, onError }
    listeners.push(listener)
    reads += matching(ref).length
    queueMicrotask(() => {
      if (listeners.includes(listener)) onNext({ docs: matching(ref), metadata: { fromCache: false } })
    })
    return () => { listeners = listeners.filter(l => l !== listener) }
  },
}))

const { readCollection, readClientMoney, refreshDoc, forgetDocs, stopAllLive } = await import('./store')

const tx = (kind, amount) => ({ __collection: 'transactions', kind, amount, clientId: 'c1' })

// Изменение в базе, пришедшее от второго пользователя: подписка получает новый
// снимок, платим только за изменившийся документ.
const serverChange = () => {
  reads += 1
  for (const l of listeners) l.onNext({ docs: matching(l.ref), metadata: { fromCache: false } })
}

beforeEach(() => {
  stopAllLive()
  listeners = []
  docs = { t1: tx('income', 100), t2: tx('expense', 50) }
  reads = 0
})

describe('живые подписки', () => {
  it('первое открытие платит за коллекцию, переходы между вкладками — ничего', async () => {
    const first = await readCollection('transactions')
    expect(first).toHaveLength(2)
    expect(reads).toBe(2)

    // Пользователь ушёл на другую вкладку и вернулся — и так десять раз.
    for (let i = 0; i < 10; i++) await readCollection('transactions')

    // Раньше каждый такой переход стоил всю коллекцию заново.
    expect(reads).toBe(2)
  })

  it('правка второго пользователя видна без перезагрузки страницы', async () => {
    await readCollection('transactions')

    docs.t3 = tx('income', 300)
    serverChange()

    const rows = await readCollection('transactions')
    expect(rows.map(r => r.id)).toContain('t3')
  })

  it('одновременный запрос двух страниц не поднимает две подписки', async () => {
    const [a, b] = await Promise.all([readCollection('clients'), readCollection('clients')])
    expect(a).toBe(b)
    expect(listeners.filter(l => l.ref.name === 'clients')).toHaveLength(1)
  })

  it('деньги клиента слушаются отдельно от всей ленты операций', async () => {
    const rows = await readClientMoney()
    // Расходов и зарплат менеджеру не отдают вовсе — в этом ключе их быть не должно.
    expect(rows.map(r => r.id)).toEqual(['t1'])
  })

  it('после выхода из системы подписки закрываются', async () => {
    await readCollection('transactions')
    await readClientMoney()
    expect(listeners.length).toBe(2)

    stopAllLive()

    expect(listeners.length).toBe(0)
  })

  it('снимок из локального кэша не выдаётся за готовые данные', async () => {
    // Firestore отдаёт первый снимок из кэша, не дожидаясь сервера, и в нём лежит
    // только то, что успели загрузить другие страницы. Так «Финансы», открытые
    // с Дашборда, показали расходы, зарплаты и изъятия нулями: Дашборд читает
    // лишь оплаты и возвраты. Поехали и баланс компании, и прибыль.
    docs.t9 = tx('expense', 7)
    const pending = readCollection('transactions')
    const listener = listeners.find(l => l.ref.name === 'transactions')

    // Пришёл неполный снимок из кэша — ждать, а не отдавать.
    listener.onNext({ docs: [{ id: 't1', data: () => docs.t1 }], metadata: { fromCache: true } })
    let settled = false
    pending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    // И только подтверждённый сервером снимок отдаём странице.
    listener.onNext({ docs: matching(listener.ref), metadata: { fromCache: false } })
    const rows = await pending
    expect(rows.map(r => r.id)).toContain('t9')
  })

  it('после подтверждения сервером снимки из кэша уже принимаются', async () => {
    // Свою собственную запись Firestore применяет локально, до ответа сервера,
    // и присылает её именно кэшированным снимком. Отбрасывать их нельзя.
    await readCollection('transactions')
    const listener = listeners.find(l => l.ref.name === 'transactions')

    docs.t7 = tx('income', 42)
    listener.onNext({ docs: matching(listener.ref), metadata: { fromCache: true } })

    expect((await readCollection('transactions')).map(r => r.id)).toContain('t7')
  })

  it('сломанная подписка не остаётся навсегда: «Повторить» поднимает её заново', async () => {
    const failure = Object.assign(new Error('нет прав'), { code: 'permission-denied' })
    const pending = readCollection('charges')
    listeners.find(l => l.ref.name === 'charges').onError(failure)
    await expect(pending).rejects.toThrow('нет прав')

    docs.ch1 = { __collection: 'charges', amount: 10 }
    const rows = await readCollection('charges', { force: true })
    expect(rows).toHaveLength(1)
  })
})

describe('точечное обновление после своей записи', () => {
  it('своя операция видна сразу и стоит одно чтение', async () => {
    await readCollection('transactions')
    const afterOpen = reads

    docs.t3 = tx('income', 300)
    await refreshDoc('transactions', 't3')

    expect(reads - afterOpen).toBe(1)
    expect((await readCollection('transactions')).map(r => r.id)).toContain('t3')
    expect((await readClientMoney()).map(r => r.id)).toContain('t3')
  })

  it('смена вида «доход → расход» убирает операцию из денег клиента', async () => {
    await readClientMoney()
    expect((await readClientMoney()).map(r => r.id)).toContain('t1')

    docs.t1 = tx('expense', 100)
    await refreshDoc('transactions', 't1')

    // Расход к балансу ученика отношения не имеет — иначе баланс покажет лишнее.
    expect((await readClientMoney()).map(r => r.id)).not.toContain('t1')
  })

  it('расход, исправленный в доход, появляется в деньгах клиента', async () => {
    await readClientMoney()
    docs.t2 = tx('income', 50)
    await refreshDoc('transactions', 't2')
    expect((await readClientMoney()).map(r => r.id)).toContain('t2')
  })

  it('удалённая операция исчезает из обоих списков и не стоит чтений', async () => {
    await readCollection('transactions')
    await readClientMoney()
    const before = reads

    delete docs.t1
    forgetDocs('transactions', ['t1'])

    expect((await readCollection('transactions')).map(r => r.id)).not.toContain('t1')
    expect((await readClientMoney()).map(r => r.id)).not.toContain('t1')
    expect(reads).toBe(before)
  })

  it('исчезнувший из базы документ убирается, а не остаётся призраком', async () => {
    await readCollection('transactions')
    delete docs.t2

    expect(await refreshDoc('transactions', 't2')).toBeNull()
    expect((await readCollection('transactions')).map(r => r.id)).not.toContain('t2')
  })

  it('сервер всё равно главнее: пришедший снимок перекрывает нашу вставку', async () => {
    await readCollection('transactions')

    docs.t3 = tx('income', 300)
    await refreshDoc('transactions', 't3')
    // Владелец удалил эту операцию в соседней вкладке.
    delete docs.t3
    serverChange()

    expect((await readCollection('transactions')).map(r => r.id)).not.toContain('t3')
  })
})
