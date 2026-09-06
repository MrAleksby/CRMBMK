// Живые подписки и точечное обновление.
//
// Этот слой отвечает за две вещи сразу: сколько система тратит обращений к базе
// (23 августа 2026 суточный лимит выбрали посреди рабочего дня) и что менеджер
// видит на экране после своей и чужой правки. Ошибка здесь не портит базу,
// но показывает неправду — поэтому тесты.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

let docs = {}          // фейковая база: id -> документ
let reads = 0          // сколько документов Firestore бы затарифицировал
let listeners = []
let silent = false   // подписка молчит: так ведёт себя залипший канал Firestore

vi.mock('../firebase', () => ({ db: {}, auth: {} }))

const matching = (ref) => Object.entries(docs)
  .filter(([, d]) => d.__collection === ref.name)
  .filter(([, d]) => !ref.clientMoney || ['income', 'refund'].includes(d.kind))
  .map(([id, d]) => ({ id, data: () => d }))

// Снимок Firestore: документы, метка «откуда» и список изменившихся документов.
// `docChanges` по умолчанию не включает снимки, где сменилась одна метка, —
// именно по нему слой решает, будить страницу или нет.
const snapshotOf = (ref, { fromCache = false, changed = null } = {}) => {
  const docs = matching(ref)
  return {
    docs,
    metadata: { fromCache },
    docChanges: () => (changed === null ? docs : changed),
  }
}

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
  // Подписка идёт с includeMetadataChanges, поэтому третий аргумент — опции.
  onSnapshot: (ref, _options, onNext, onError) => {
    const listener = { ref, onNext, onError }
    listeners.push(listener)
    reads += matching(ref).length
    queueMicrotask(() => {
      if (!silent && listeners.includes(listener)) onNext(snapshotOf(ref))
    })
    return () => { listeners = listeners.filter(l => l !== listener) }
  },
}))

const { readCollection, readClientMoney, refreshDoc, forgetDocs, stopAllLive, watch } = await import('./store')

const tx = (kind, amount) => ({ __collection: 'transactions', kind, amount, clientId: 'c1' })

// Изменение в базе, пришедшее от второго пользователя: подписка получает новый
// снимок, платим только за изменившийся документ.
const serverChange = () => {
  reads += 1
  for (const l of listeners) l.onNext(snapshotOf(l.ref))
}

beforeEach(async () => {
  // Сигнал слушателям собирается на такт вперёд. Даём ему сработать до теста,
  // иначе он догонит следующий и тот увидит чужое пробуждение.
  await new Promise(resolve => setTimeout(resolve, 0))
  stopAllLive()
  listeners = []
  silent = false
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
    listener.onNext({
      docs: [{ id: 't1', data: () => docs.t1 }],
      metadata: { fromCache: true },
      docChanges: () => [],
    })
    let settled = false
    pending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    // И только подтверждённый сервером снимок отдаём странице.
    listener.onNext(snapshotOf(listener.ref))
    const rows = await pending
    expect(rows.map(r => r.id)).toContain('t9')
  })

  it('подтверждение сервером приходит одной сменой метки — и его довольно', async () => {
    // С кэшем на диске Firestore отдаёт всю коллекцию сразу, но помечает
    // «из кэша». Если данные с прошлого раза не менялись, подтверждать ему
    // нечего, и приходит снимок, где сменилась одна метка. Не принимать его
    // нельзя: страница висела бы на «Загрузка...» до самого таймаута.
    const pending = readCollection('transactions')
    const listener = listeners.find(l => l.ref.name === 'transactions')

    listener.onNext(snapshotOf(listener.ref, { fromCache: true }))
    listener.onNext(snapshotOf(listener.ref, { fromCache: false, changed: [] }))

    expect((await pending).map(r => r.id)).toEqual(['t1', 't2'])
  })

  it('смена одной метки страницу не будит', async () => {
    await readCollection('transactions')
    const listener = listeners.find(l => l.ref.name === 'transactions')
    const woken = vi.fn()
    const off = watch(woken)

    // Таких снимков с includeMetadataChanges приходит много: «ушло на сервер»,
    // «сервер подтвердил». Данные в них те же — перечитывать страницу незачем.
    listener.onNext(snapshotOf(listener.ref, { changed: [] }))
    await new Promise(resolve => setTimeout(resolve, 0))
    off()

    expect(woken).not.toHaveBeenCalled()
  })

  it('после подтверждения сервером снимки из кэша уже принимаются', async () => {
    // Свою собственную запись Firestore применяет локально, до ответа сервера,
    // и присылает её именно кэшированным снимком. Отбрасывать их нельзя.
    await readCollection('transactions')
    const listener = listeners.find(l => l.ref.name === 'transactions')

    docs.t7 = tx('income', 42)
    listener.onNext(snapshotOf(listener.ref, { fromCache: true }))

    expect((await readCollection('transactions')).map(r => r.id)).toContain('t7')
  })

  it('молчащая подписка поднимается «Повторить», а не перезагрузкой страницы', async () => {
    // Ошибку слушателя Firestore сообщает сам, а вот залипший канал просто молчит.
    // Раньше повтор вставал в очередь к той же мёртвой подписке и ждал впустую —
    // помогала только перезагрузка страницы, и не с первого раза.
    vi.useFakeTimers()
    try {
      silent = true
      // Ошибку ловим сразу: если повесить обработчик после прокрутки таймеров,
      // отказ успеет пройти незамеченным и вылезет как unhandled rejection.
      const pending = readCollection('lessons').catch(e => e)
      const dead = listeners.find(l => l.ref.name === 'lessons')

      await vi.advanceTimersByTimeAsync(46_000)
      expect((await pending).name).toBe('TimeoutError')

      silent = false
      docs.l1 = { __collection: 'lessons', date: '2026-09-06' }
      const rows = await readCollection('lessons', { force: true })

      expect(rows).toHaveLength(1)
      expect(listeners).not.toContain(dead)
    } finally {
      vi.useRealTimers()
    }
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

describe('сигнал «данные изменились»', () => {
  // Сигнал собирается в один на такт, поэтому ждём его через таймер.
  const settled = () => new Promise(resolve => setTimeout(resolve, 0))

  // Слушатели живут вне подписок и выход из системы их не снимает — за собой
  // убирает страница, когда её размонтируют. В тестах роль страницы играем мы.
  let stop = []
  const listen = (cb) => { const off = watch(cb); stop.push(off); return off }
  afterEach(() => { stop.forEach(off => off()); stop = [] })

  it('чужая правка будит страницу, а не ждёт перехода на вкладку', async () => {
    await readCollection('transactions')
    const woken = vi.fn()
    listen(woken)

    docs.t3 = tx('income', 300)
    serverChange()
    await settled()

    expect(woken).toHaveBeenCalledTimes(1)
  })

  it('первый снимок страницу не будит: его она и так ждёт', async () => {
    const woken = vi.fn()
    listen(woken)

    await readCollection('transactions')
    await settled()

    // Лишний сигнал здесь означал бы вторую загрузку сразу за первой.
    expect(woken).not.toHaveBeenCalled()
  })

  it('запись сразу в несколько коллекций будит один раз, а не трижды', async () => {
    // writeBatch трогает операцию, начисление и абонемент — снимков придёт три.
    await Promise.all([
      readCollection('transactions'),
      readCollection('charges'),
      readCollection('subscriptions'),
    ])
    const woken = vi.fn()
    listen(woken)

    serverChange()
    await settled()

    expect(woken).toHaveBeenCalledTimes(1)
  })

  it('уход со страницы снимает слушателя', async () => {
    await readCollection('transactions')
    const woken = vi.fn()
    const unwatch = listen(woken)

    unwatch()
    serverChange()
    await settled()

    // Иначе размонтированная страница обновляла бы состояние вечно.
    expect(woken).not.toHaveBeenCalled()
  })

  it('пробуждение не стоит обращений к базе', async () => {
    await readCollection('transactions')
    const rows = []
    listen(() => { readCollection('transactions').then(r => rows.push(r)) })

    serverChange()
    const before = reads
    await settled()
    await settled()

    expect(rows).toHaveLength(1)
    // Строки уже лежат в подписке — перечитывать нечего.
    expect(reads).toBe(before)
  })
})
