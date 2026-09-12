// Семья: несколько детей, у которых общий кошелёк.
//
// Зачем это вообще. Родители покупают один пакет на двоих детей. Раньше его
// приходилось делить пополам заранее — то есть предсказывать, кто сколько
// отходит. Предсказание не сбывалось: один болел, второй ходил чаще, и суммы
// приходилось переписывать задним числом.
//
// Поэтому пакет не делится вовсе. Деньги семьи лежат в общем кошельке и тратятся
// по факту занятий: у кого больше проведённых уроков, за того больше и списано.
// Дети при этом остаются отдельными клиентами — своя карточка, свой журнал,
// свои занятия. Общий у них только счёт.
//
// Ключевое правило, ради которого написан этот модуль: **общий кошелёк в итогах
// считается один раз**. Долги, предоплаты, метрики Дашборда и «Финансов» идут
// по кошелькам, а не по детям, иначе одни и те же деньги сложились бы дважды.

// Кошелёк ребёнка. Семейный — общий на всех детей семьи, личный — свой.
// Строковый ключ, а не объект: по нему складывают в Map.
export function walletKey(client) {
  const familyId = client?.familyId || ''
  return familyId ? `family:${familyId}` : `client:${client?.id || ''}`
}

export const isFamilyWallet = (key) => String(key).startsWith('family:')

// Кошельки по списку учеников: ключ → сами дети, имя семьи.
// Один проход по клиентам: списки большие, а страницы зовут это на каждый рендер.
export function wallets(clients, families = []) {
  const nameById = new Map(families.map(f => [f.id, f.name || '']))
  const map = new Map()

  for (const client of clients) {
    const key = walletKey(client)
    if (!map.has(key)) {
      map.set(key, {
        key,
        familyId: client.familyId || '',
        familyName: client.familyId ? (nameById.get(client.familyId) || 'Семья') : '',
        clients: [],
      })
    }
    map.get(key).clients.push(client)
  }
  return map
}

// Семья ребёнка со всеми её детьми. Пусто, если ребёнок сам по себе.
export function familyOf(client, clients, families = []) {
  if (!client?.familyId) return null
  const wallet = wallets(clients, families).get(walletKey(client))
  return wallet ? { ...wallet, id: client.familyId } : null
}

// Дети семьи, кроме самого ребёнка. Нужно для подписи «вместе с Петром».
export const siblings = (client, clients) =>
  (client?.familyId ? clients.filter(c => c.familyId === client.familyId && c.id !== client.id) : [])

// Как подписать семью в интерфейсе. Названия у неё нет: фамилия не годится,
// у брата и сестры они бывают разными. Семья и есть её дети, поэтому
// подписываем именами — в строке ребёнка именами остальных, в списках всеми.
export const familyLabel = (client, clients) => namesOf(siblings(client, clients))

// Имена через запятую: «Пётр Сидоров и Мария Сидорова».
export function namesOf(list) {
  const names = list.map(c => c.childName || 'Без имени')
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} и ${names.at(-1)}`
}

// Подпись к сумме в списке учеников: почему у двух строк одно и то же число.
export const sharedNote = (count) =>
  (count > 1 ? `общий на ${count} ${childWord(count)}` : '')

// У слова «ребёнок» множественное число супплетивное: 1 ребёнка, но 2 детей.
function childWord(count) {
  const last = count % 10
  const twoLast = count % 100
  return (last === 1 && twoLast !== 11) ? 'ребёнка' : 'детей'
}

// Начисления всей семьи по датам. Долг считается «сколько последних занятий
// не покрыто деньгами», а деньги общие — значит и занятия надо брать общие,
// иначе у ребёнка, за которого платил брат, долг посчитается по своим урокам.
export function walletCharges(client, clients, charges) {
  const ids = new Set([client.id, ...siblings(client, clients).map(c => c.id)])
  return charges.filter(c => ids.has(c.clientId))
}
