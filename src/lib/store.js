// Общий слой чтения Firestore.
//
// Страницы читают одни и те же коллекции: `transactions` (1500+ записей) грузили
// Дашборд, Клиенты, Карточка и Уроки — каждый раз заново, при каждом переходе.
// Здесь это чтение одно на всех: результат живёт в памяти TTL секунд, а запросы,
// пришедшие одновременно, склеиваются в один.
//
// Свежесть данных не страдает: после **своей** записи страница перечитывает
// с `force: true`, минуя кэш. Чужую правку (менеджер в соседнем браузере) видно
// с задержкой до TTL — на это и рассчитан короткий срок жизни.

import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { withTimeout } from './withTimeout'
import { clientMoneyQuery } from './finance'

const TTL_MS = 30_000

const cache = new Map()      // key -> { at, rows }
const inflight = new Map()   // key -> Promise

const rowsOf = (snapshot) => snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

const fresh = (entry) => entry && (Date.now() - entry.at) < TTL_MS

async function read(key, fetcher, { force = false } = {}) {
  if (!force && fresh(cache.get(key))) return cache.get(key).rows

  // Четыре страницы, поднявшиеся разом, не должны слать четыре одинаковых запроса.
  if (!force && inflight.has(key)) return inflight.get(key)

  const promise = withTimeout(fetcher())
    .then(snapshot => {
      const rows = rowsOf(snapshot)
      cache.set(key, { at: Date.now(), rows })
      return rows
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, promise)
  return promise
}

export const readCollection = (name, opts) =>
  read(name, () => getDocs(collection(db, name)), opts)

// Оплаты и возвраты — всё, что нужно для балансов. Отдельный ключ: у менеджера
// это не «часть transactions», а единственное, что ему вообще отдают правила.
export const readClientMoney = (opts) =>
  read('transactions:client-money', () => getDocs(clientMoneyQuery(db)), opts)

// Сбросить кэш. Без аргументов — целиком.
export function invalidate(...names) {
  if (names.length === 0) {
    cache.clear()
    return
  }
  for (const name of names) cache.delete(name)
}
