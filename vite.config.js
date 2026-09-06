import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Версия сборки: короткий хэш коммита и дата. Нужна для двух вещей сразу —
// чтобы человек мог назвать свою версию, не гадая, и чтобы приложение само
// замечало выход новой.
//
// Повод: 6 сентября владелец полдня работал на утренней сборке и не видел
// правок. Причина оказалась не в кэше сервера, а в том, что одностраничное
// приложение, пока вкладка открыта, код не перезапрашивает вовсе.
function buildVersion() {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    return `${hash} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  } catch {
    // Сборка без git (например, из архива) — не повод падать.
    return new Date().toISOString().slice(0, 16).replace('T', ' ')
  }
}

const VERSION = buildVersion()

// Файл рядом со сборкой: приложение спрашивает его на ходу и сравнивает
// с версией, зашитой внутрь себя. Отдаётся с no-cache (см. firebase.json).
const emitVersionFile = () => ({
  name: 'fingam-version-file',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: VERSION }),
    })
  },
})

// base по умолчанию — подпапка GitHub Pages.
// Для Firebase Hosting сайт лежит в корне: VITE_BASE=/ npm run build
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), emitVersionFile()],
  base: process.env.VITE_BASE || '/CRMBMK/',
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
  },
})
