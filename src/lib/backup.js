import { collection, getDocs } from 'firebase/firestore'
import { db, auth } from '../firebase'

// Скачивает снимок всех коллекций одним JSON-файлом.
// На плане Spark штатные бэкапы Firestore недоступны — это замена.
export async function downloadBackup() {
  if (auth.currentUser) await auth.currentUser.getIdToken()

  const [clients, payments, expenses] = await Promise.all([
    getDocs(collection(db, 'clients')),
    getDocs(collection(db, 'payments')),
    getDocs(collection(db, 'expenses')),
  ])

  const dump = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const data = {
    exportedAt: new Date().toISOString(),
    clients: dump(clients),
    payments: dump(payments),
    expenses: dump(expenses),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fingam-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
