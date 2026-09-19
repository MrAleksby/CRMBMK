// Данные для сквозного прогона: маленькая, но настоящая база в эмуляторе.
//
// Сквозной тест поднимает НАСТОЯЩУЮ страницу CRM и нажимает её кнопки, а потом
// читает, что от этого осталось в базе. Поэтому здесь нужны все связи, которые
// страница спрашивает: аккаунт с правами, ученики, группа, занятие, бонусы.
//
// Боевую базу не трогает: без эмулятора отказывается работать.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Только эмулятор. Запуск: npm run e2e')
  process.exit(1)
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'crmbmk-d6303' })
const db = getFirestore()
const auth = getAuth()

export const E2E = {
  email: 'e2e@example.com',
  password: 'sandbox123',
  uid: 'e2e-admin',
  lessonId: 'e2e-lesson',
  today: new Date().toISOString().slice(0, 10),
}

await auth.createUser({ uid: E2E.uid, email: E2E.email, password: E2E.password, emailVerified: true })
  .catch(e => { if (e.code !== 'auth/uid-already-exists') throw e })

const set = (path, data) => db.doc(path).set(data)

await Promise.all([
  set(`users/${E2E.uid}`, { email: E2E.email, role: 'admin', approved: true }),

  // Аня платила вперёд, у неё же бонус за приглашённого. Боря ничего не платил.
  set('clients/anya', { childName: 'Аня Тестова', status: 'active', lessonPrice: 300000 }),
  set('clients/borya', { childName: 'Боря Тестов', status: 'active' }),
  // Отдельный ребёнок для прогона по деньгам: занятия и оплаты не должны
  // мешать друг другу, иначе упавший тест не скажет, что именно сломалось.
  set('clients/vitya', { childName: 'Витя Тестов', status: 'active' }),

  set('accounts/cash', { name: 'Наличные' }),
  set('categories/tuition', { name: 'Оплата за занятия', kind: 'income' }),

  // Предоплата Ани: 1 000 000 в кассу и на лицевой счёт.
  set('transactions/pay1', {
    kind: 'income', amount: 1000000, date: Timestamp.fromDate(new Date()),
    accountId: 'cash', categoryId: 'tuition', clientId: 'anya', comment: 'Предоплата',
  }),

  // Бонус за приглашённого — 150 000, чтобы в журнале появилось поле «Бонус».
  set('bonuses/b1', {
    kind: 'earn', reason: 'referral_trial', amount: 150000, clientId: 'anya',
    invitedId: 'borya', lessonId: '', comment: '', date: Timestamp.fromDate(new Date()),
  }),

  set('groups/g1', { name: 'Группа Е2Е', studentIds: ['anya', 'borya'] }),

  set(`lessons/${E2E.lessonId}`, {
    date: E2E.today, timeFrom: '11:00', timeTo: '13:00', status: 'planned',
    type: 'group', groupId: 'g1', groupName: 'Группа Е2Е',
    studentIds: ['anya', 'borya'], attendance: [],
  }),
])

console.log('Песочница для сквозного прогона готова.')
process.exit(0)
