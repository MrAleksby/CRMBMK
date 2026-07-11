// Запись миграции в Firestore. Расчёты — в migrate.js.

import { collection, doc, writeBatch, getDocs } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { nextOrder } from './directories'
import { invalidate } from './store'

// Firestore не принимает больше 500 операций в одной транзакции.
const BATCH_LIMIT = 400

const chunk = (list, size) => {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}

// Досоздаёт недостающие статьи и возвращает обновлённый справочник.
export async function createCategories(specs, categories) {
  if (specs.length === 0) return categories

  const batch = writeBatch(db)
  const created = specs.map(spec => {
    const ref = doc(collection(db, 'categories'))
    const item = { ...spec, order: nextOrder(categories, spec.kind), active: true }
    batch.set(ref, item)
    return { id: ref.id, ...item }
  })
  await batch.commit()
  return [...categories, ...created]
}

// Записывает план батчами, чтобы не упереться в лимит Firestore.
export async function applyMigration({ transactions, charges }) {
  for (const part of chunk(transactions, BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const row of part) batch.set(doc(collection(db, 'transactions')), row)
    await batch.commit()
  }
  for (const part of chunk(charges, BATCH_LIMIT)) {
    const batch = writeBatch(db)
    for (const row of part) batch.set(doc(collection(db, 'charges')), row)
    await batch.commit()
  }
  invalidate()
  return { transactions: transactions.length, charges: charges.length }
}

// Что уже перенесено: sourceId защищает от повторного создания.
export async function loadMigrationState() {
  if (auth.currentUser) await auth.currentUser.getIdToken()

  const names = ['payments', 'expenses', 'transactions', 'charges', 'categories', 'accounts']
  const snapshots = await Promise.all(names.map(name => getDocs(collection(db, name))))
  const [payments, expenses, transactions, charges, categories, accounts] =
    snapshots.map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))

  const done = [...transactions, ...charges].map(row => row.sourceId).filter(Boolean)
  return { payments, expenses, transactions, charges, categories, accounts, done }
}
