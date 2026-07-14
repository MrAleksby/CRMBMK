// Резервная копия Firestore: выгружает все коллекции в один JSON.
//
// Запускается по расписанию из GitHub Actions (.github/workflows/backup.yml) —
// то есть в облаке, а не на ноутбуке владельца. Ноутбук может смениться или
// сломаться, копии от этого не должны прекращаться.
//
// Локально:  node scripts/backup.mjs               (нужен GOOGLE_APPLICATION_CREDENTIALS
//                                                    или FIREBASE_SERVICE_ACCOUNT)
// В Actions: ключ приходит переменной FIREBASE_SERVICE_ACCOUNT.
//
// Ключ сервис-аккаунта даёт полный доступ к базе и правила Firestore обходит.
// Поэтому он живёт только в GitHub Secrets и в .gitignore — в репозиторий не попадает.

import { writeFile, mkdir } from 'node:fs/promises'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// Все коллекции, которые составляют базу. Список явный, а не «что найдётся»:
// забытая коллекция в бэкапе обнаружится только в день, когда копия понадобится.
const COLLECTIONS = [
  'clients', 'transactions', 'charges', 'subscriptions',
  'groups', 'lessons', 'leads',
  'teachers', 'packages', 'accounts', 'categories', 'legalEntities',
  'users',
  // Старая модель. Кодом не читается, но пока лежит в базе — пусть лежит и в копии.
  'payments', 'expenses',
]

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (raw) return cert(JSON.parse(raw))

  // Локальный запуск: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json.
  // Без ключа firebase-admin падает стектрейсом на сорок строк — подсказка полезнее.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      'Нет ключа сервис-аккаунта.\n\n' +
      'Скачайте его: консоль Firebase → Настройки проекта → Сервисные аккаунты →\n' +
      '«Создать закрытый ключ». Затем:\n\n' +
      '  export GOOGLE_APPLICATION_CREDENTIALS=~/путь/к/ключу.json\n' +
      '  node scripts/backup.mjs\n\n' +
      'Ключ даёт полный доступ к базе — в git его класть нельзя (он уже в .gitignore).')
    process.exit(1)
  }
  return applicationDefault()
}

// Timestamp Firestore в JSON превращается в { _seconds, _nanoseconds } и при
// восстановлении становится обычным объектом — дата теряется. Помечаем тип явно,
// чтобы restore.mjs вернул именно Timestamp.
function encode(value) {
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds }
  }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]))
  }
  return value
}

async function main() {
  initializeApp({ credential: credentials() })
  const db = getFirestore()

  const data = {}
  let total = 0

  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get()
    data[name] = snap.docs.map(doc => ({ id: doc.id, data: encode(doc.data()) }))
    total += snap.size
    console.log(`${name}: ${snap.size}`)
  }

  const takenAt = new Date()
  const dump = {
    takenAt: takenAt.toISOString(),
    project: process.env.GCLOUD_PROJECT || 'crmbmk-d6303',
    collections: data,
  }

  // Имя с датой: копии складываются в ленту, и видно, за какой день откат.
  const day = takenAt.toISOString().slice(0, 10)
  const dir = process.env.BACKUP_DIR || 'backups'
  await mkdir(dir, { recursive: true })
  const file = `${dir}/${day}.json`
  await writeFile(file, JSON.stringify(dump, null, 2))

  console.log(`\nГотово: ${file} — документов ${total}`)

  // Пустая база — почти наверняка сломанный ключ или не тот проект.
  // Записать такую «копию» поверх вчерашней хуже, чем не записать вовсе.
  if (total === 0) {
    console.error('В базе ноль документов — копия не сохранена как валидная.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
