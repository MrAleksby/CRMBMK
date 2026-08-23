// Песочница: копия боевой базы в локальном эмуляторе.
//
// Проверять изменения на боевой базе нельзя — это чужие деньги и живые дети.
// Проверять на пустой базе бессмысленно: половина ошибок вылезает только на
// настоящих объёмах (1800 операций, 354 занятия) и на настоящих связях между
// записями. Поэтому здесь разворачивается вчерашняя копия — в эмулятор.
//
//   npm run sandbox                       — поднять эмулятор с копией и держать
//   npm run sandbox -- backups/2026-08-22.json
//
// В соседнем окне:
//   VITE_USE_EMULATOR=1 npm run dev
//
// Боевую базу скрипт не трогает вовсе: он работает только с эмулятором и
// отказывается запускаться без него. Суточный лимит чтений не тратится.

import { readFile, readdir } from 'node:fs/promises'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const PASSWORD = 'sandbox123'

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Скрипт работает только с эмулятором — боевую базу он трогать не должен.\n\n' +
    '  npx firebase emulators:exec --only firestore,auth "node scripts/sandbox.mjs"\n' +
    'или просто:  npm run sandbox')
  process.exit(1)
}

function decode(value) {
  if (value && typeof value === 'object' && value.__type === 'timestamp') {
    return new Timestamp(value.seconds, value.nanoseconds)
  }
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]))
  }
  return value
}

// По умолчанию — самая свежая копия из репозитория бэкапов, если он склонирован
// рядом, иначе из локальной папки backups/.
async function findBackup() {
  const explicit = process.argv[2]
  if (explicit) return explicit

  for (const dir of ['backups', '../CRMBMK-backups/backups']) {
    try {
      const files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort()
      if (files.length) return `${dir}/${files.at(-1)}`
    } catch { /* папки нет — пробуем следующую */ }
  }
  throw new Error('Копия не найдена. Укажите файл: npm run sandbox -- backups/ДАТА.json')
}

async function main() {
  const file = await findBackup()
  const dump = JSON.parse(await readFile(file, 'utf8'))

  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'crmbmk-d6303' })
  const db = getFirestore()
  const auth = getAuth()

  let total = 0
  for (const [name, docs] of Object.entries(dump.collections)) {
    // Предел Firestore — 500 операций на батч.
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch()
      for (const item of docs.slice(i, i + 400)) {
        batch.set(db.collection(name).doc(item.id), decode(item.data))
      }
      await batch.commit()
    }
    total += docs.length
  }

  // Вход в песочницу. UID берём из самой копии, иначе профиль (роль, доступ)
  // не совпадёт с документом в `users` и правила не пустят внутрь.
  const accounts = []
  for (const item of dump.collections.users || []) {
    const email = item.data.email
    if (!email) continue
    await auth.createUser({ uid: item.id, email, password: PASSWORD, emailVerified: true })
      .catch(err => { if (err.code !== 'auth/uid-already-exists') throw err })
    accounts.push(`${email} / ${PASSWORD}  (${item.data.role || 'без роли'})`)
  }

  console.log(`\nПесочница готова: ${file}`)
  console.log(`Документов залито: ${total}\n`)
  console.log('Вход:')
  for (const line of accounts) console.log(`  ${line}`)
  console.log('\nЗапустите в соседнем окне:  VITE_USE_EMULATOR=1 npm run dev')
  console.log('Боевая база не затронута.\n')
}

main().catch(err => { console.error(err); process.exit(1) })
