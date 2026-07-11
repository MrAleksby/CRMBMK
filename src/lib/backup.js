import { collection, getDocs } from 'firebase/firestore'
import { db, auth } from '../firebase'

// Скачивает снимок всех коллекций одним JSON-файлом.
// На плане Spark штатные бэкапы Firestore недоступны — это замена.
export async function downloadBackup() {
  if (auth.currentUser) await auth.currentUser.getIdToken()

  // Список полный: заводя новую коллекцию, добавлять её сюда, иначе она молча
  // не попадёт в копию. Так уже терялись `leads` — воронку завели позже бэкапа.
  //
  // payments и expenses — старая модель. Пока не удалены, копируем и их:
  // бэкап должен пережить миграцию на transactions/charges.
  const names = [
    'clients', 'leads', 'transactions', 'charges', 'payments', 'expenses',
    'groups', 'lessons', 'subscriptions',
    'teachers', 'packages', 'accounts', 'categories', 'legalEntities',
    'users',
  ]
  const snapshots = await Promise.all(names.map(name => getDocs(collection(db, name))))

  const dump = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const data = {
    exportedAt: new Date().toISOString(),
    ...Object.fromEntries(names.map((name, i) => [name, dump(snapshots[i])])),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fingam-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
