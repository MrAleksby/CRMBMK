import { initializeApp } from 'firebase/app'
import { initializeFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

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
