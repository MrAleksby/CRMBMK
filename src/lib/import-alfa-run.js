// Запись импорта из AlfaCRM в Firestore. Маппинг — в import-alfa.js.

import { collection, doc, getDocs, writeBatch, setDoc } from 'firebase/firestore'
import { db, auth } from '../firebase'

const BATCH_LIMIT = 400

const chunk = (list, size) => {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}

// Файлы выгрузки читаются в браузере: FileList → объект с массивами.
const FILE_MAP = {
  'customers.json': 'customers',
  'customers-archive.json': 'customersArchive',
  'pays.json': 'pays',
  'groups.json': 'groups',
  'teachers.json': 'teachers',
  'tariffs.json': 'tariffs',
  'customer-tariffs.json': 'customerTariffs',
  'pay-accounts.json': 'payAccounts',
  'pay-items.json': 'payItems',
}

const LESSON_FILES = ['lessons-conducted.json', 'lessons-planned.json', 'lessons-cancelled.json']

export const REQUIRED_FILES = [...Object.keys(FILE_MAP), ...LESSON_FILES]

export async function readDump(files) {
  const dump = { lessons: [] }
  const seen = new Set()

  for (const file of files) {
    const name = file.name
    if (!FILE_MAP[name] && !LESSON_FILES.includes(name)) continue

    const rows = JSON.parse(await file.text())
    seen.add(name)
    if (LESSON_FILES.includes(name)) dump.lessons.push(...rows)
    else dump[FILE_MAP[name]] = rows
  }

  const missing = REQUIRED_FILES.filter(name => !seen.has(name))
  return { dump, missing }
}

// Коллекции, которые импорт замещает целиком. legalEntities, payments и expenses
// не трогаем: первых в AlfaCRM нет, вторые — архив старой модели.
export const REPLACED = [
  'clients', 'transactions', 'charges', 'lessons', 'groups',
  'subscriptions', 'accounts', 'categories', 'teachers', 'packages',
]

export async function countExisting() {
  if (auth.currentUser) await auth.currentUser.getIdToken()
  const snapshots = await Promise.all(REPLACED.map(name => getDocs(collection(db, name))))
  return Object.fromEntries(REPLACED.map((name, i) => [name, snapshots[i].size]))
}

export async function clearCollections(names, onProgress = () => {}) {
  for (const name of names) {
    const snapshot = await getDocs(collection(db, name))
    for (const part of chunk(snapshot.docs, BATCH_LIMIT)) {
      const batch = writeBatch(db)
      for (const document of part) batch.delete(document.ref)
      await batch.commit()
    }
    onProgress(`очищено: ${name} (${snapshot.size})`)
  }
}

// Порядок важен: справочники раньше того, что на них ссылается.
const WRITE_ORDER = [
  'accounts', 'categories', 'teachers', 'packages',
  'clients', 'groups', 'lessons', 'subscriptions', 'charges', 'transactions',
]

export async function writeImport(plan, onProgress = () => {}) {
  if (auth.currentUser) await auth.currentUser.getIdToken()
  const written = {}

  for (const name of WRITE_ORDER) {
    const docs = plan[name] || []
    for (const part of chunk(docs, BATCH_LIMIT)) {
      const batch = writeBatch(db)
      for (const { id, data } of part) batch.set(doc(db, name, id), data)
      await batch.commit()
    }
    written[name] = docs.length
    onProgress(`записано: ${name} (${docs.length})`)
  }
  return written
}

// Имя ученика в начислениях заполняется из клиентов — так лента читается
// без лишних чтений. Отдельным проходом, чтобы не тянуть клиентов в маппинг.
export async function backfillClientNames() {
  const snapshot = await getDocs(collection(db, 'clients'))
  return Object.fromEntries(snapshot.docs.map(d => [d.id, d.data().childName]))
}

export { setDoc }
