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

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { withTimeout } from './withTimeout'
import { clientMoneyQuery } from './finance'

// Срок жизни кэша разный, потому что данные разные.
//
// Бесплатный Firestore даёт 50 000 чтений в сутки, а одно открытие «Финансов» —
// это 2 600 документов. Тридцать секунд кэша означали, что переход между
// страницами читает базу заново, и лимит выбирается за день активной работы
// (мы это уже поймали 14 июля 2026).
//
// Справочники (кассы, статьи, педагоги, тарифы) меняются раз в месяц — им можно
// жить полчаса. Деньги и занятия — две минуты: столько допустимо не видеть
// правку, сделанную вторым пользователем в соседнем браузере. Свою правку видно
// сразу: после записи страница читает с `force: true`.
const TTL_DEFAULT_MS = 120_000
const TTL_STATIC_MS = 1_800_000

const STATIC = new Set(['accounts', 'categories', 'teachers', 'packages', 'legalEntities'])

const ttlFor = (key) => (STATIC.has(key) ? TTL_STATIC_MS : TTL_DEFAULT_MS)

const cache = new Map()      // key -> { at, rows }
const inflight = new Map()   // key -> Promise

const rowsOf = (snapshot) => snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

const fresh = (key, entry) => entry && (Date.now() - entry.at) < ttlFor(key)

async function read(key, fetcher, { force = false } = {}) {
  if (!force && fresh(key, cache.get(key))) return cache.get(key).rows

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

// Занятия одного дня. Дашборду не нужны все 337 занятий истории — ему нужен
// сегодняшний день. Точечный запрос вместо всей коллекции: 3 документа вместо 337.
export const readLessonsOfDay = (day, opts) =>
  read(`lessons:${day}`,
    () => getDocs(query(collection(db, 'lessons'), where('date', '==', day))),
    opts)

// Сбросить кэш после своей записи. Без аргументов — всё, кроме справочников:
// принятая оплата не меняет ни кассы, ни статьи, ни тарифы, а перечитывать их
// заново — лишние чтения на ровном месте. Справочник сбрасывает сам DirectoryTable,
// передавая своё имя явно.
export function invalidate(...names) {
  if (names.length === 0) {
    for (const key of [...cache.keys()]) {
      if (!STATIC.has(key)) cache.delete(key)
    }
    return
  }
  for (const name of names) cache.delete(name)
}
