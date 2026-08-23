import { initializeApp } from 'firebase/app'
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

// По умолчанию Firestore ходит через WebChannel. Если сеть, провайдер или расширение
// браузера его режут, SDK не падает с ошибкой, а молча ждёт — страница висит на «Загрузка...».
// autoDetectLongPolling распознаёт такую сеть и переключается на long-polling.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
})

export const auth = getAuth(app)

// Песочница: приложение работает против локального эмулятора с копией боевых
// данных. Нужна, чтобы проверять изменения на настоящих объёмах, не трогая
// рабочую базу и не тратя суточный лимит чтений.
//
//   npm run sandbox        — поднять эмулятор и залить в него вчерашнюю копию
//   VITE_USE_EMULATOR=1 npm run dev
//
// Флага нет в сборке для боевого сайта, поэтому в продакшен этот код не влияет.
if (import.meta.env.VITE_USE_EMULATOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  console.info('[FinGam] Песочница: работаем с локальным эмулятором, боевая база не затронута')
}
