import { initializeApp } from 'firebase/app'
import {
  initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'
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
//
// Кэш на диске (IndexedDB) — против долгого входа. Без него каждое открытие CRM
// выкачивало всю историю заново: «Финансы» — это 2400 документов, на медленной
// связи такая перекачка не укладывалась в отведённые 15 секунд, человек видел
// «Сервер не ответил» и обновлял страницу по пять раз подряд.
//
// С кэшем SDK поднимает данные с диска, а у сервера спрашивает только то, что
// изменилось с прошлого раза (по resume-токену подписки). Едет не история,
// а разница — и вход перестаёт зависеть от её объёма. Заодно это ещё одна
// экономия чтений: перезагрузка страницы больше не тарифицируется целиком.
//
// tabManager — многовкладочный: карточка ученика открывается в новой вкладке
// (`target="_blank"`), а с однооконным менеджером вторая вкладка не получила бы
// доступ к кэшу и упала бы с ошибкой.
//
// Если IndexedDB недоступна (режим инкогнито, запрет на данные сайтов), SDK
// сообщает об этом в консоль и работает как раньше, из памяти. Терять нечего:
// это ровно то поведение, что было до кэша.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
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
