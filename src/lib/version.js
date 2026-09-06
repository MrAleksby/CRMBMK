// Версия приложения и слежение за выходом новой.
//
// CRM — одностраничное приложение: пока вкладка открыта, оно код не
// перезапрашивает вовсе. 6 сентября 2026 владелец полдня работал на утренней
// сборке и не видел правок — ни кэш сервера, ни жёсткая перезагрузка тут ни при
// чём, вкладка просто была открыта с утра. На планшете это обычное дело:
// вкладки живут неделями.
//
// Поэтому приложение само спрашивает у сервера, какая версия выложена, и,
// если она другая, предлагает обновиться. Проверка стоит один маленький файл
// и к базе отношения не имеет — суточный лимит чтений не тратится.

// Подставляется при сборке (см. vite.config.js). В `npm run dev` его нет.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'разработка'

// Раз в пять минут. Чаще незачем: выкатываем несколько раз в день, а не в час.
const EVERY_MS = 5 * 60 * 1000

const versionUrl = () => `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`

// Читаем в обход кэша: спрашиваем именно у сервера, иначе смысла нет.
async function published() {
  const response = await fetch(versionUrl(), { cache: 'no-store' })
  if (!response.ok) throw new Error(`version.json: ${response.status}`)
  const data = await response.json()
  return data.version
}

// Зовёт onNewVersion(версия), когда на сервере оказалась не та сборка, что
// открыта сейчас. Возвращает функцию остановки.
//
// Проверяем при запуске, по таймеру и при возвращении на вкладку: планшет
// усыпляет фоновые вкладки, и таймер там может не сработать месяцами.
export function watchVersion(onNewVersion) {
  if (APP_VERSION === 'разработка') return () => {}

  let stopped = false
  const check = async () => {
    if (stopped) return
    try {
      const latest = await published()
      if (!stopped && latest && latest !== APP_VERSION) onNewVersion(latest)
    } catch {
      // Нет сети или файла — не беда: это удобство, а не работа с данными.
      // Молчим намеренно, чтобы не пугать человека в консоли на каждый обрыв.
    }
  }

  check()
  const timer = setInterval(check, EVERY_MS)
  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
