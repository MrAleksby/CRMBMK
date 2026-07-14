// Проверка восстановления: разворачивает копию в ЭМУЛЯТОР Firestore и сверяет,
// что вернулось ровно то, что было сохранено.
//
// Бэкап, который ни разу не разворачивали, — это надежда, а не страховка.
// Проверять на боевой базе нельзя, поэтому проверяем на пустом эмуляторе.
//
//   npx firebase emulators:exec --only firestore "node scripts/verify-restore.mjs backups/2026-07-14.json"
//
// Эмулятор поднимается пустым, скрипт заливает в него копию через тот же restore.mjs
// и сравнивает: число документов, поля, и главное — что даты остались датами.
// Timestamp, превратившийся в JSON-объект, ломает все сортировки, и заметить это
// в день катастрофы — худший из возможных вариантов.

import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const file = process.argv[2]
if (!file) {
  console.error('Укажите файл копии: node scripts/verify-restore.mjs backups/2026-07-14.json')
  process.exit(1)
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Скрипт работает только с эмулятором — боевую базу он трогать не должен.\n\n' +
    '  npx firebase emulators:exec --only firestore \\\n' +
    `    "node scripts/verify-restore.mjs ${file}"`)
  process.exit(1)
}

const problems = []
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`)
  if (!ok) problems.push(message)
}

async function main() {
  const dump = JSON.parse(await readFile(file, 'utf8'))
  console.log(`Копия от ${dump.takenAt}\nЭмулятор: ${process.env.FIRESTORE_EMULATOR_HOST}\n`)

  initializeApp({ projectId: dump.project })
  const db = getFirestore()

  // Эмулятор поднят пустым — убеждаемся в этом до восстановления, иначе проверка
  // «данные на месте» пройдёт даже на сломанном restore.
  const before = await db.collection('clients').get()
  check(before.empty, 'эмулятор пуст до восстановления')

  console.log('\nВосстанавливаем...\n')
  execFileSync('node', ['scripts/restore.mjs', file, '--yes'], { stdio: 'inherit' })

  console.log('\nСверяем:\n')

  for (const [name, docs] of Object.entries(dump.collections)) {
    if (!docs.length) continue
    const snap = await db.collection(name).get()
    check(snap.size === docs.length, `${name}: ${snap.size} из ${docs.length}`)
  }

  // Даты. В JSON Timestamp — это { seconds, nanoseconds }; если restore вернул их
  // объектом, а не Timestamp, сортировка по дате молча перестанет работать.
  const tx = await db.collection('transactions').limit(1).get()
  const date = tx.docs[0]?.get('date')
  check(date instanceof Timestamp, 'дата операции вернулась как Timestamp, а не как объект')

  // Содержимое, а не только количество: сверяем случайный документ поле в поле.
  const sample = dump.collections.clients[0]
  const live = await db.collection('clients').doc(sample.id).get()
  check(live.exists, `ученик ${sample.id} восстановлен`)
  check(live.get('childName') === sample.data.childName,
    `имя совпадает: «${live.get('childName')}»`)

  // Деньги — то, ради чего всё затевалось.
  const all = await db.collection('transactions').get()
  const sum = all.docs.reduce((total, d) => {
    const sign = { income: 1, expense: -1, salary: -1, refund: -1, draw: -1, transfer: 0 }
    return total + (sign[d.get('kind')] ?? 0) * (d.get('amount') || 0)
  }, 0)
  const original = dump.collections.transactions.reduce((total, { data }) => {
    const sign = { income: 1, expense: -1, salary: -1, refund: -1, draw: -1, transfer: 0 }
    return total + (sign[data.kind] ?? 0) * (data.amount || 0)
  }, 0)
  check(Math.abs(sum - original) < 0.01,
    `баланс компании сошёлся: ${Math.round(sum).toLocaleString('ru')} сум`)

  console.log(problems.length
    ? `\nПРОВЕРКА НЕ ПРОЙДЕНА: ${problems.length}`
    : '\nВосстановление работает: копия разворачивается полностью и без потерь.')
  process.exit(problems.length ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
