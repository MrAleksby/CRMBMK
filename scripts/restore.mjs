// Восстановление Firestore из копии, снятой scripts/backup.mjs.
//
// До сих пор копии можно было только СНЯТЬ. Вернуть их в базу было нечем —
// в критический момент пришлось бы писать код в панике. Этот скрипт закрывает дыру.
//
//   node scripts/restore.mjs backups/2026-07-14.json --dry-run
//   node scripts/restore.mjs backups/2026-07-14.json --collections clients,lessons
//   node scripts/restore.mjs backups/2026-07-14.json --yes
//
// По умолчанию — сухой прогон: печатает, что сделает, и ничего не пишет.
// Записывает только с флагом --yes.
//
// Восстановление НЕ удаляет документы, появившиеся после копии: оно перезаписывает
// то, что было в копии, по id. Так безопаснее — случайный запуск не сотрёт свежие
// оплаты. Чтобы вернуть коллекцию ровно к состоянию копии, нужен флаг --wipe.

import { readFile } from 'node:fs/promises'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const BATCH_LIMIT = 400   // предел Firestore — 500 операций на батч

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (raw) return cert(JSON.parse(raw))

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      'Нет ключа сервис-аккаунта.\n\n' +
      '  export GOOGLE_APPLICATION_CREDENTIALS=~/путь/к/ключу.json\n' +
      '  node scripts/restore.mjs backups/2026-07-14.json')
    process.exit(1)
  }
  return applicationDefault()
}

// Обратное к encode() из backup.mjs: помеченные даты возвращаем в Timestamp,
// иначе они лягут в базу обычным объектом и все сортировки по дате сломаются.
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

function parseArgs(argv) {
  const [file] = argv.filter(a => !a.startsWith('--'))
  const flag = (name) => argv.includes(`--${name}`)
  const value = (name) => {
    const found = argv.find(a => a.startsWith(`--${name}=`))
    return found ? found.split('=')[1] : null
  }

  return {
    file,
    apply: flag('yes'),
    wipe: flag('wipe'),
    only: (value('collections') || '').split(',').filter(Boolean),
  }
}

async function commit(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
    await batch.commit()
  }
}

async function main() {
  const { file, apply, wipe, only } = parseArgs(process.argv.slice(2))
  if (!file) {
    console.error('Укажите файл копии: node scripts/restore.mjs backups/2026-07-14.json')
    process.exit(1)
  }

  const dump = JSON.parse(await readFile(file, 'utf8'))
  console.log(`Копия от ${dump.takenAt}, проект ${dump.project}\n`)

  initializeApp({ credential: credentials() })
  const db = getFirestore()

  const names = Object.keys(dump.collections).filter(n => !only.length || only.includes(n))

  for (const name of names) {
    const docs = dump.collections[name] || []
    const live = await db.collection(name).get()

    const inBackup = new Set(docs.map(d => d.id))
    const extra = live.docs.filter(d => !inBackup.has(d.id))

    console.log(`${name}: в копии ${docs.length}, в базе сейчас ${live.size}` +
      (extra.length ? `, появилось после копии: ${extra.length}` : ''))

    if (!apply) continue

    await commit(db, docs.map(({ id, data }) => (batch) =>
      batch.set(db.collection(name).doc(id), decode(data))))

    // Удаляем лишнее только по прямому требованию: обычно «лишнее» — это оплаты,
    // принятые уже после снятия копии, и стирать их нельзя.
    if (wipe && extra.length) {
      await commit(db, extra.map(doc => (batch) => batch.delete(doc.ref)))
      console.log(`  удалено появившихся после копии: ${extra.length}`)
    }
  }

  if (!apply) {
    console.log('\nСухой прогон — база не изменена. Повторите с --yes, чтобы записать.')
    return
  }
  console.log('\nВосстановление завершено.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
