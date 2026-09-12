// Запись семьи в Firestore. Чистая логика общего кошелька лежит в `family.js`
// и Firestore не знает — так же, как `migrate.js` и `migrate-run.js`.

import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Менеджер не придумывает семье название, а выбирает ученика, с которым
// у ребёнка общий счёт. Названия у семьи нет намеренно: фамилии у брата
// и сестры бывают разными, и «семья Ивановы» была бы неправдой.
//
// Дальше два случая. У выбранного ученика семья уже есть — ребёнок просто
// входит в неё (так добавляется третий). Семьи нет — заводим её и сразу
// связываем с ней выбранного ученика; карточку самого ребёнка сохранит
// страница, вернув ей готовый familyId.
export async function ensureFamilyId(data, { linkClient } = {}) {
  if (!linkClient) return data
  if (linkClient.familyId) return { ...data, familyId: linkClient.familyId }

  const ref = await addDoc(collection(db, 'families'), { name: '', createdAt: new Date() })
  await updateDoc(doc(db, 'clients', linkClient.id), { familyId: ref.id })
  return { ...data, familyId: ref.id }
}
