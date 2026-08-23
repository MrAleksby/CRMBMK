// Общий слой чтения Firestore.
//
// Страницы читают одни и те же коллекции: `transactions` (1800+ записей) нужны
// Дашборду, Клиентам, Карточке и Урокам. Раньше каждый переход между вкладками
// читал их заново, и суточный лимит бесплатного Firestore (50 000 чтений)
// выбирался за час работы менеджера — 23 августа 2026 система встала посреди дня.
//
// Поэтому большие коллекции здесь не «читаются», а **слушаются**: подписка
// (`onSnapshot`) живёт, пока открыта вкладка. Firestore берёт плату за документы
// первого снимка, а дальше присылает только то, что действительно изменилось.
// Переход между вкладками не стоит ничего вовсе.
//
// Побочный выигрыш важнее экономии: правку, сделанную вторым пользователем,
// теперь видно сразу, а не через срок жизни кэша.

import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { withTimeout } from './withTimeout'
import { clientMoneyQuery, CLIENT_MONEY_KINDS } from './finance'

const rowsOf = (snapshot) => snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

// ── Живые подписки ───────────────────────────────────────────────────────────
//
// key -> { rows, error, waiters, unsubscribe }
// `rows === null` означает «первый снимок ещё не пришёл»: тот, кто читает,
// встаёт в очередь `waiters` и получит данные, как только они появятся.
const live = new Map()

function startLive(key, makeQuery) {
  // confirmed — снимок пришёл с сервера, а не только из локального кэша.
  const entry = { rows: null, error: null, confirmed: false, waiters: [], unsubscribe: null }
  live.set(key, entry)

  const settle = (method, value) => {
    const waiting = entry.waiters.splice(0)
    for (const waiter of waiting) waiter[method](value)
  }

  entry.unsubscribe = onSnapshot(
    makeQuery(),
    snapshot => {
      entry.rows = rowsOf(snapshot)
      entry.error = null
      // Первый снимок Firestore отдаёт из локального кэша, не дожидаясь сервера,
      // и в нём лежит только то, что уже загружали другие страницы. Для «Финансов»
      // это означало бы неполную ленту: Дашборд читает лишь оплаты и возвраты,
      // поэтому расходы, зарплаты и изъятия показались бы нулями — а вместе с ними
      // поехали бы баланс компании и прибыль.
      //
      // Поэтому ждём подтверждения сервером: отдаём данные только когда снимок
      // полный. Уже подтверждённые данные потом обновляются и из кэша — там
      // Firestore применяет нашу собственную запись до ответа сервера.
      if (!snapshot.metadata.fromCache) entry.confirmed = true
      if (entry.confirmed) settle('resolve', entry.rows)
    },
    error => {
      // Firestore при ошибке слушателя прекращает слушать сам. Держать мёртвую
      // запись нельзя: следующее обращение должно попробовать подписаться заново
      // (вход мог устареть, лимит — восстановиться).
      entry.error = error
      entry.rows = null
      live.delete(key)
      settle('reject', error)
    },
  )
  return entry
}

function stopLive(key) {
  const entry = live.get(key)
  if (!entry) return
  entry.unsubscribe?.()
  live.delete(key)
}

// Закрыть все подписки. Вызывается при выходе из системы: слушатель, переживший
// разлогин, получит отказ по правам и засорит консоль ошибками.
export function stopAllLive() {
  for (const key of [...live.keys()]) stopLive(key)
  cache.clear()
}

function readLive(key, makeQuery, { force = false } = {}) {
  // Подписка жива — данные в ней всегда свежие, читать нечего.
  // `force` для живого ключа означает не «перечитать» (нечего перечитывать),
  // а «подписка сломалась, подними заново» — по кнопке «Повторить».
  let entry = live.get(key)
  if (force && entry?.error) { stopLive(key); entry = undefined }
  if (!entry) entry = startLive(key, makeQuery)

  if (entry.rows && entry.confirmed) return Promise.resolve(entry.rows)
  if (entry.error) return Promise.reject(entry.error)

  // Первого снимка ещё нет — ждём его. Таймаут обязателен: при заблокированном
  // транспорте onSnapshot молчит бесконечно, и страница зависла бы на «Загрузка...».
  return withTimeout(new Promise((resolve, reject) => {
    entry.waiters.push({ resolve, reject })
  }))
}

// ── Разовые чтения с кэшем ───────────────────────────────────────────────────
//
// Для точечных запросов, которых много и каждый свой: занятия конкретного дня.
// Держать подписку на каждый день невыгодно — это разовое чтение трёх документов.
const TTL_MS = 120_000
const cache = new Map()   // key -> { at, rows }
const inflight = new Map()

async function readOnce(key, fetcher, { force = false } = {}) {
  const entry = cache.get(key)
  if (!force && entry && Date.now() - entry.at < TTL_MS) return entry.rows
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

// ── Публичное API ────────────────────────────────────────────────────────────

export const readCollection = (name, opts) =>
  readLive(name, () => collection(db, name), opts)

// Оплаты и возвраты — всё, что нужно для балансов. Отдельный ключ: у менеджера
// это не «часть transactions», а единственное, что ему вообще отдают правила.
export const readClientMoney = (opts) =>
  readLive('transactions:client-money', () => clientMoneyQuery(db), opts)

// Занятия одного дня. Дашборду не нужны все занятия истории — ему нужен сегодня.
export const readLessonsOfDay = (day, opts) =>
  readOnce(`lessons:${day}`,
    () => getDocs(query(collection(db, 'lessons'), where('date', '==', day))),
    opts)

// ── Точечное обновление после своей записи ───────────────────────────────────
//
// Живая подписка присылает своё же изменение почти мгновенно, но «почти» здесь
// недостаточно: между `commit()` и приходом снимка страница успела бы перерисоваться
// и на миг показать ленту без только что принятой оплаты. Дочитываем записанный
// документ сами — одно чтение, зато порядок гарантирован.

const CLIENT_MONEY_KEY = 'transactions:client-money'

// В каких ключах может лежать документ этой коллекции и при каком условии.
// Оплаты и возвраты живут не только в `transactions`, но и в отдельном ключе.
const KEYS = {
  transactions: [
    { key: 'transactions', belongs: () => true },
    { key: CLIENT_MONEY_KEY, belongs: (row) => CLIENT_MONEY_KINDS.includes(row.kind) },
  ],
}

const keysFor = (name) => KEYS[name] || [{ key: name, belongs: () => true }]

// Вставить строку или убрать её, если ключу она больше не подходит: правка могла
// сменить вид операции (доход → расход), и из «денег клиента» её нужно удалить,
// иначе баланс ученика покажет лишнее.
function apply(name, row, { removed = false } = {}) {
  for (const { key, belongs } of keysFor(name)) {
    const entry = live.get(key)
    // Никто эту коллекцию не слушает — обновлять нечего.
    if (!entry?.rows) continue
    const rows = entry.rows.filter(r => r.id !== row.id)
    if (!removed && belongs(row)) rows.push(row)
    entry.rows = rows
  }
}

// Дочитать один документ и обновить им данные подписки. Стоит одно чтение.
export async function refreshDoc(name, id) {
  const snapshot = await withTimeout(getDoc(doc(db, name, id)))
  if (!snapshot.exists()) {
    apply(name, { id }, { removed: true })
    return null
  }
  const row = { id: snapshot.id, ...snapshot.data() }
  apply(name, row)
  return row
}

// Убрать удалённые документы. Чтений не стоит вовсе.
export function forgetDocs(name, ids) {
  for (const id of ids) apply(name, { id }, { removed: true })
}

// Перечитать заново. При живых подписках это нужно редко: данные и так свежие.
// Оставлено для справочников — DirectoryTable зовёт его после своей правки.
export function invalidate(...names) {
  if (names.length === 0) {
    for (const key of [...cache.keys()]) cache.delete(key)
    return
  }
  for (const name of names) {
    stopLive(name)
    cache.delete(name)
  }
}
