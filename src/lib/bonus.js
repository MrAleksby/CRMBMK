// Бонусы за приглашённых детей.
//
// Правило владельца: привёл новичка — получаешь 50 000 после его первого
// проведённого занятия и 10 000 за каждое следующее его посещение. Потратить
// бонусы можно на занятия, питание и абонементы. Суммы меняются в Настройках.
//
// **Бонус — это не деньги, а право на скидку.** Отсюда всё устройство:
//
// - Бонусы лежат в отдельной коллекции `bonuses`. Кассы у них нет, в баланс
//   компании и в прибыль они не входят: школе никто этих денег не платил.
// - Потраченный бонус уменьшает начисление за занятие (или цену абонемента).
//   Значит прибыль падает ровно на сумму бонуса — это и есть расход компании
//   на программу приглашений: деньги, которые школа отдала пригласившему.
//   Обратный путь, «списать полную сумму и дорисовать оплату», завысил бы
//   прибыль на все начисленные бонусы: в отчёте появились бы деньги, которых
//   никто не вносил. Так уже было с изъятиями владельца, второй раз не хотим.
// - Начисления помечены занятием (`lessonId`). Поэтому откат занятия снимает
//   и бонусы, а повторное проведение начисляет их заново, а не вторым слоем.
//
// Кошелёк бонусов — тот же, что и денежный: у семьи общий, у одиночки свой.

import { walletKey } from './family'

export const EARN = 'earn'
export const SPEND = 'spend'

export const REASON_TRIAL = 'referral_trial'
export const REASON_VISIT = 'referral_visit'
export const REASON_LESSON = 'lesson_discount'
export const REASON_SUBSCRIPTION = 'subscription_discount'
export const REASON_MANUAL = 'manual'

export const REASON_LABELS = {
  [REASON_TRIAL]: 'За пробное приглашённого',
  [REASON_VISIT]: 'За посещение приглашённого',
  [REASON_LESSON]: 'Оплата занятия бонусами',
  [REASON_SUBSCRIPTION]: 'Оплата абонемента бонусами',
  [REASON_MANUAL]: 'Вручную',
}

// Суммы по умолчанию. Живут в `bonusRules/current` и меняются в Настройках;
// здесь — на случай, когда документа ещё нет.
export const DEFAULT_RULES = { trial: 50_000, visit: 10_000 }

export const bonusRules = (doc) => ({
  trial: Number.isFinite(doc?.trial) ? doc.trial : DEFAULT_RULES.trial,
  visit: Number.isFinite(doc?.visit) ? doc.visit : DEFAULT_RULES.visit,
})

// Кошелёк записи: у семьи один на всех, у одиночки свой.
const keyOf = (row) => walletKey({ id: row.clientId, familyId: row.familyId })

// Остатки бонусов по кошелькам.
export function bonusBalances(bonuses) {
  const totals = new Map()
  for (const row of bonuses) {
    const amount = Number(row.amount) || 0
    const delta = row.kind === SPEND ? -amount : amount
    const key = keyOf(row)
    totals.set(key, (totals.get(key) || 0) + delta)
  }
  return totals
}

// Сколько бонусов у этого ребёнка (то есть у его кошелька).
export const bonusBalanceOf = (client, bonuses) =>
  (bonusBalances(bonuses).get(walletKey(client || {})) || 0)

// Записи кошелька — лента в карточке.
export const walletBonuses = (client, bonuses) =>
  bonuses.filter(row => keyOf(row) === walletKey(client || {}))

// Кого пригласил этот ребёнок.
export const invitedBy = (client, clients) =>
  clients.filter(c => c.referrerId && c.referrerId === client?.id)

// Начисления за проведённое занятие.
//
// Бонус получает пригласивший — за каждого своего приглашённого, который
// на этом занятии был. Первое проведённое занятие приглашённого считается
// пробным и даёт большую сумму, все следующие — обычную.
//
// `priorBonuses` — уже начисленные бонусы, кроме относящихся к этому занятию:
// по ним видно, было ли у пары «пригласивший — приглашённый» пробное. Считать
// по занятиям нельзя: занятие могли откатить, и тогда пробное должно начислиться
// заново, иначе за один и тот же первый визит человек получит меньше.
export function earnedBonuses({ lesson, attendance = [], clients = [], priorBonuses = [], rules = DEFAULT_RULES }) {
  const byId = new Map(clients.map(c => [c.id, c]))
  const hadTrial = new Set(priorBonuses
    .filter(b => b.kind === EARN && b.reason === REASON_TRIAL)
    .map(b => `${keyOf(b)}→${b.invitedId}`))

  const docs = []
  for (const record of attendance) {
    if (record.status !== 'present') continue

    const invited = byId.get(record.clientId)
    const referrer = invited?.referrerId ? byId.get(invited.referrerId) : null
    if (!referrer || referrer.id === invited.id) continue

    // Приглашение внутри семьи бонуса не даёт: кошелёк-то общий, школа
    // заплатила бы сама себе.
    if (walletKey(referrer) === walletKey(invited)) continue

    const pair = `${walletKey(referrer)}→${invited.id}`
    const first = !hadTrial.has(pair)
    if (first) hadTrial.add(pair)

    const amount = first ? rules.trial : rules.visit
    if (!(amount > 0)) continue

    docs.push({
      kind: EARN,
      amount,
      reason: first ? REASON_TRIAL : REASON_VISIT,
      clientId: referrer.id,
      familyId: referrer.familyId || '',
      invitedId: invited.id,
      invitedName: invited.childName || '',
      lessonId: lesson?.id || '',
      comment: '',
    })
  }
  return docs
}

// Траты бонусов на этом занятии: сколько кто закрыл бонусами.
export function spentBonuses({ lesson, attendance = [], clients = [] }) {
  const byId = new Map(clients.map(c => [c.id, c]))
  const docs = []

  for (const record of attendance) {
    const amount = Number(record.amountBonus) || 0
    if (!(amount > 0)) continue
    const client = byId.get(record.clientId)

    docs.push({
      kind: SPEND,
      amount,
      reason: REASON_LESSON,
      clientId: record.clientId,
      familyId: client?.familyId || '',
      lessonId: lesson?.id || '',
      comment: '',
    })
  }
  return docs
}

// Хватает ли бонусов на то, что ввели в журнале. Считаем по кошелькам:
// брат и сестра на одном занятии тратят из одного кармана, и порознь
// проверка пропустила бы двойной расход.
export function validateBonusSpending(rows, clients, bonuses) {
  const byId = new Map(clients.map(c => [c.id, c]))
  const balances = bonusBalances(bonuses)
  const planned = new Map()

  for (const row of rows) {
    const amount = Number(String(row.amountBonus ?? '').replace(',', '.').replace(/\s/g, '')) || 0
    if (!(amount > 0)) continue
    const key = walletKey(byId.get(row.clientId) || {})
    planned.set(key, (planned.get(key) || 0) + amount)
  }

  for (const [key, amount] of planned) {
    const available = balances.get(key) || 0
    if (amount > available) {
      const name = rows.find(r => walletKey(byId.get(r.clientId) || {}) === key)?.clientName || 'ученика'
      return `Бонусов не хватает: у ${name} их ${available.toLocaleString()}, а списать пытаетесь ${amount.toLocaleString()}`
    }
  }
  return null
}
