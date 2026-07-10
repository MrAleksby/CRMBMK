// Выгрузка данных из AlfaCRM через REST API v2.
//
// Зачем: экспорт в файл из интерфейса не отдаёт идентификаторы, поэтому платежи
// невозможно надёжно связать с учениками, а проведённые уроки не выгружаются вовсе.
// API отдаёт всё как есть, вместе с id.
//
// Запуск:
//   1) Профиль AlfaCRM (правый верхний угол) → скопировать «E-mail» и «Ключ API (v2api)»
//   2) Вписать их в .env — файл не коммитится:
//        ALFACRM_HOST=bmk.s20.online
//        ALFACRM_EMAIL=...
//        ALFACRM_KEY=...
//   3) node --env-file=.env scripts/alfacrm-export.mjs
//
// Результат: data/alfacrm/*.json — по файлу на сущность. Папка в .gitignore.

import { writeFile, mkdir } from 'node:fs/promises'

const HOST = process.env.ALFACRM_HOST
const EMAIL = process.env.ALFACRM_EMAIL
const KEY = process.env.ALFACRM_KEY
const OUT = 'data/alfacrm'

if (!HOST || !EMAIL || !KEY) {
  console.error('Не заданы ALFACRM_HOST, ALFACRM_EMAIL, ALFACRM_KEY в .env')
  process.exit(1)
}

const base = `https://${HOST}/v2api`

// AlfaCRM разрешает не больше 5 запросов в секунду.
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const THROTTLE_MS = 250

let token = null

async function call(path, body = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-ALFACRM-TOKEN': token } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${path} → HTTP ${response.status}: ${text.slice(0, 300)}`)
  }
  return response.json()
}

async function login() {
  const data = await call('/auth/login', { email: EMAIL, api_key: KEY })
  if (!data.token) throw new Error('Логин прошёл, но токена нет. Проверьте ключ API.')
  token = data.token
  console.log('Авторизация — успех')
}

// Токен живёт час; выгрузка длиннее часа маловероятна, но перелогин дешевле падения.
async function fetchAll(branch, entity, filter = {}) {
  const rows = []
  let page = 0

  while (true) {
    const data = await call(`/${branch}/${entity}/index`, { ...filter, page })
    const items = data.items || []
    rows.push(...items)

    const total = data.total ?? rows.length
    process.stdout.write(`\r  ${entity}: ${rows.length} из ${total}   `)

    if (items.length === 0 || rows.length >= total) break
    page += 1
    await sleep(THROTTLE_MS)
  }
  process.stdout.write('\n')
  return rows
}

const readSaved = async (file) => {
  const { readFile } = await import('node:fs/promises')
  return JSON.parse(await readFile(`${OUT}/${file}.json`, 'utf8'))
}

// customer-tariff требует customer_id: обходим всех учеников, включая архивных,
// иначе история абонементов выпавших клиентов потеряется.
async function fetchCustomerTariffs(branch) {
  const customers = [...await readSaved('customers'), ...await readSaved('customers-archive')]

  const rows = []
  let done = 0
  for (const customer of customers) {
    // customer_id этот метод принимает только в строке адреса, в теле его игнорируют.
    const data = await call(`/${branch}/customer-tariff/index?customer_id=${customer.id}`, { page: 0 })
    rows.push(...(data.items || []).map(item => ({ ...item, customer_id: customer.id })))
    done += 1
    process.stdout.write(`\r  customer-tariff: ${done} из ${customers.length} учеников, найдено ${rows.length}   `)
    await sleep(THROTTLE_MS)
  }
  process.stdout.write('\n')
  return rows
}

// Состав групп: cgi требует group_id и отдаёт точный список учеников.
// Без него состав приходится угадывать по тому, кто ходил на занятия.
async function fetchGroupMembers(branch) {
  const groups = await readSaved('groups')
  const rows = []
  for (const group of groups) {
    const data = await call(`/${branch}/cgi/index?group_id=${group.id}`, { page: 0 })
    rows.push(...(data.items || []).map(item => ({ ...item, group_id: group.id })))
    process.stdout.write(`\r  cgi: групп ${rows.length ? groups.indexOf(group) + 1 : 0} из ${groups.length}, записей ${rows.length}   `)
    await sleep(THROTTLE_MS)
  }
  process.stdout.write('\n')
  return rows
}

async function save(name, rows) {
  await writeFile(`${OUT}/${name}.json`, JSON.stringify(rows, null, 2))
  console.log(`  сохранено: ${OUT}/${name}.json (${rows.length} записей)`)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  await login()

  // Филиал: обычно один. Берём первый, если не задан явно.
  let branch = process.env.ALFACRM_BRANCH
  if (!branch) {
    const branches = await call('/branch/index', {})
    const first = (branches.items || [])[0]
    branch = String(first?.id ?? 1)
    console.log(`Филиал: ${first?.name ?? '(не определён)'} → id ${branch}`)
  }

  // Уроки тянем по статусам отдельно: так видно, что именно выгрузилось,
  // и проведённые не теряются в общей куче.
  const LESSON_STATUS = { planned: 1, cancelled: 2, conducted: 3 }

  const jobs = [
    ['customers', () => fetchAll(branch, 'customer', { is_study: 1 })],
    ['customers-archive', () => fetchAll(branch, 'customer', { is_study: 0 })],
    ['pays', () => fetchAll(branch, 'pay')],
    ['groups', () => fetchAll(branch, 'group')],
    // Расписание групп живёт отдельно: день недели, время, период.
    ['regular-lessons', () => fetchAll(branch, 'regular-lesson')],
    ['teachers', () => fetchAll(branch, 'teacher')],
    ['tariffs', () => fetchAll(branch, 'tariff')],
    ['lessons-conducted', () => fetchAll(branch, 'lesson', { status: LESSON_STATUS.conducted })],
    ['lessons-planned', () => fetchAll(branch, 'lesson', { status: LESSON_STATUS.planned })],
    ['lessons-cancelled', () => fetchAll(branch, 'lesson', { status: LESSON_STATUS.cancelled })],

    // Справочники: в платежах и уроках лежат только числовые id, без них не расшифровать.
    ['pay-accounts', () => fetchAll(branch, 'pay-account')],
    ['pay-items', () => fetchAll(branch, 'pay-item')],
    ['pay-types', () => fetchAll(branch, 'pay-type')],
    ['lesson-types', () => fetchAll(branch, 'lesson-type')],
    ['study-statuses', () => fetchAll(branch, 'study-status')],
    ['lead-sources', () => fetchAll(branch, 'lead-source')],
    ['subjects', () => fetchAll(branch, 'subject')],

    // Воронка лидов: сами лиды лежат среди клиентов (is_study: 0),
    // здесь только названия этапов и причины отказа.
    ['lead-statuses', () => fetchAll(branch, 'lead-status')],
    ['lead-rejects', () => fetchAll(branch, 'lead-reject')],
    ['customer-rejects', () => fetchAll(branch, 'customer-reject')],
    ['pipelines', () => fetchAll(branch, 'pipeline')],
    ['locations', () => fetchAll(branch, 'location')],
    ['users', () => fetchAll(branch, 'user')],
    ['tasks', () => fetchAll(branch, 'task')],

    // История изменений — архив на случай спора «кто и когда поменял сумму».
    ['logs', () => fetchAll(branch, 'log')],

    // Абонементы выдаются поштучно и запрашиваются только по конкретному ученику.
    ['customer-tariffs', () => fetchCustomerTariffs(branch)],
    ['group-members', () => fetchGroupMembers(branch)],
  ]

  const failures = []
  for (const [name, job] of jobs) {
    console.log(`\n${name}:`)
    try {
      await save(name, await job())
    } catch (e) {
      // Часть сущностей может быть недоступна на тарифе или называться иначе —
      // это не повод терять остальные.
      console.error(`  пропущено: ${e.message}`)
      failures.push(name)
    }
    await sleep(THROTTLE_MS)
  }

  console.log('\nГотово.')
  if (failures.length) console.log(`Не выгрузилось: ${failures.join(', ')}`)
}

main().catch(e => {
  console.error('\nОшибка:', e.message)
  process.exit(1)
})
