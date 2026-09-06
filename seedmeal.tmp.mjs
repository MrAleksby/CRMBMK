process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
initializeApp({ projectId: 'crmbmk-d6303' })
const db = getFirestore()

// Берём начисления последних занятий и делим сумму: 90% занятие, 10% питание.
const snap = await db.collection('charges').orderBy('date', 'desc').limit(24).get()
let n = 0
for (const d of snap.docs) {
  const c = d.data()
  const amount = Number(c.amount) || 0
  if (!amount) continue
  const meal = Math.round(amount * 0.1 / 1000) * 1000
  await d.ref.update({ amountLesson: amount - meal, amountMeal: meal, comment: '' })
  n++
}
console.log(`разбивка проставлена у ${n} начислений`)
process.exit(0)
