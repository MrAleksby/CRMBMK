// Запись семьи в Firestore. Чистая логика общего кошелька лежит в `family.js`
// и Firestore не знает — так же, как `migrate.js` и `migrate-run.js`.

import { addDoc, collection } from 'firebase/firestore'
import { db } from '../firebase'

// Карточку сохраняют один раз, а семья при этом может быть ещё не заведена:
// менеджер выбрал «+ Новая семья» и набрал фамилию. Создаём документ и отдаём
// готовый id, чтобы карточка ушла в базу уже связанной.
export async function ensureFamilyId(data, { newFamilyName } = {}) {
  const name = (newFamilyName || '').trim()
  if (!name) return data

  const ref = await addDoc(collection(db, 'families'), { name, createdAt: new Date() })
  return { ...data, familyId: ref.id }
}
