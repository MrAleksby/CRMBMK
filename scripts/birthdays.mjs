// Напоминание о днях рождения учеников в Telegram.
//
// Запускается каждое утро из GitHub Actions. Если именинников нет — молчит:
// бот, который пишет «сегодня никого», перестают читать через неделю.
//
// Предупреждаем дважды: за день (успеть подготовиться) и в сам день (не забыть).
//
//   TELEGRAM_BOT_TOKEN — токен бота от @BotFather
//   TELEGRAM_CHAT_ID   — куда слать; несколько получателей через запятую
//   FIREBASE_SERVICE_ACCOUNT — ключ доступа к базе (тот же, что у бэкапа)
//
// Проверить руками, ничего не отправляя:  node scripts/birthdays.mjs --dry-run

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DRY_RUN = process.argv.includes('--dry-run')

// Часовой пояс Ташкента: сервер GitHub живёт по UTC, и в 21:00 UTC у него
// ещё «вчера», а в Ташкенте уже наступило завтра. Без сдвига поздравления
// уезжали бы на день.
const TASHKENT_OFFSET_HOURS = 5

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const plural = (n, one, few, many) => {
  const lastTwo = Math.abs(n) % 100
  const last = Math.abs(n) % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} ${many}`
  if (last === 1) return `${n} ${one}`
  if (last >= 2 && last <= 4) return `${n} ${few}`
  return `${n} ${many}`
}

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (raw) return cert(JSON.parse(raw))
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Нет ключа сервис-аккаунта (FIREBASE_SERVICE_ACCOUNT или GOOGLE_APPLICATION_CREDENTIALS).')
    process.exit(1)
  }
  return applicationDefault()
}

// «Сегодня» по Ташкенту, а не по серверу.
function today() {
  const now = new Date()
  return new Date(now.getTime() + TASHKENT_OFFSET_HOURS * 3600_000)
}

// День рождения сравниваем по месяцу и числу: год у каждого свой.
const isBirthday = (birthDate, date) => {
  const [, m, d] = String(birthDate).split('-').map(Number)
  return m === date.getUTCMonth() + 1 && d === date.getUTCDate()
}

// Сколько исполняется — на дату праздника, а не на сегодня.
function turningAge(birthDate, date) {
  const [year] = String(birthDate).split('-').map(Number)
  const age = date.getUTCFullYear() - year
  return age > 0 && age < 120 ? age : null
}

// Кому писать. Если TELEGRAM_CHAT_ID не задан, спрашиваем у самого телеграма:
// все, кто нажал боту «Запустить», видны в getUpdates. Так настройка сводится
// к одному секрету — токену, а искать chat_id руками не нужно.
//
// Оговорка: getUpdates помнит события лишь сутки. Найденные id печатаются в лог —
// их стоит закрепить секретом TELEGRAM_CHAT_ID, чтобы бот не «забыл» получателя.
async function findChats(token) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
  const body = await res.json()
  if (!body.ok) {
    console.error('Telegram не отдал обновления:', body.description)
    process.exit(1)
  }

  const chats = new Map()
  for (const update of body.result || []) {
    const chat = update.message?.chat || update.my_chat_member?.chat
    if (chat) chats.set(String(chat.id), chat.first_name || chat.title || '')
  }
  return chats
}

async function send(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (DRY_RUN) {
    console.log('--- сообщение (сухой прогон, не отправлено):\n')
    console.log(text)
    return
  }
  if (!token) {
    console.error('Нет TELEGRAM_BOT_TOKEN.')
    process.exit(1)
  }

  let chats = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean)

  if (!chats.length) {
    const found = await findChats(token)
    if (!found.size) {
      console.error(
        'Некому писать: никто не нажал боту «Запустить».\n' +
        'Пусть менеджер откроет бота и нажмёт Start, затем запустите ещё раз.')
      process.exit(1)
    }
    chats = [...found.keys()]
    console.log('Получатели найдены автоматически:')
    for (const [id, name] of found) console.log(`  ${id} — ${name}`)
    console.log('Закрепите их секретом TELEGRAM_CHAT_ID: getUpdates помнит только сутки.\n')
  }

  for (const chat_id of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
    })
    const body = await res.json()
    if (!body.ok) {
      console.error(`Telegram отказал для ${chat_id}:`, body.description)
      process.exit(1)
    }
    console.log(`Отправлено в ${chat_id}`)
  }
}

async function main() {
  initializeApp({ credential: credentials() })
  const db = getFirestore()

  const snap = await db.collection('clients').get()
  // Лиды — ещё не ученики, их поздравлять рано.
  const students = snap.docs
    .map(d => d.data())
    .filter(c => c.birthDate && (c.status || 'active') !== 'lead')

  const now = today()
  const tomorrow = new Date(now.getTime() + 86_400_000)

  const heroesToday = students.filter(c => isBirthday(c.birthDate, now))
  const heroesTomorrow = students.filter(c => isBirthday(c.birthDate, tomorrow))

  if (!heroesToday.length && !heroesTomorrow.length) {
    console.log('Именинников нет — сообщение не отправляем.')
    return
  }

  const line = (c, date) => {
    const age = turningAge(c.birthDate, date)
    return `• <b>${c.childName}</b>${age ? ` — ${plural(age, 'год', 'года', 'лет')}` : ''}`
  }

  const parts = []

  if (heroesToday.length) {
    parts.push(`🎂 <b>Сегодня день рождения</b>\n${heroesToday.map(c => line(c, now)).join('\n')}`)
  }
  if (heroesTomorrow.length) {
    const when = `${tomorrow.getUTCDate()} ${MONTHS[tomorrow.getUTCMonth()]}`
    parts.push(`📅 <b>Завтра, ${when}</b>\n${heroesTomorrow.map(c => line(c, tomorrow)).join('\n')}`)
  }

  await send(parts.join('\n\n'))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
