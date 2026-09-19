/* @vitest-environment jsdom */
//
// Сквозной прогон: настоящая страница «Уроки» против настоящего Firestore.
//
// Юнит-тесты проверяют формулы, аудит — уже записанные данные. Между ними есть
// щель: страница может посчитать верно и записать не то (или не туда). Именно
// там жил потерянный бонус — формулы сходились, аудит ругался, а виноват был
// сбор документа в Lessons.jsx.
//
// Здесь нажимаются кнопки настоящей страницы, а потом читается, что от этого
// осталось в базе эмулятора. Боевая база не участвует.
//
//   npm run e2e
//
// Без эмулятора набор пропускается: обычный `npm test` его не запускает.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { AuthProvider, useAuth } from '../AuthContext'
import { stopAllLive } from '../lib/store'
import Lessons from '../pages/Lessons'
import { clientBalances } from '../lib/balance'
import { lessonsLeft } from '../lib/subscription'
import { bonusBalanceOf } from '../lib/bonus'
import { chargesGross, bonusExpense, realizedProfit, companyBalance, accountTotals } from '../lib/finance'

// jsdom не реализует matchMedia, а страница спрашивает ширину экрана, чтобы
// выбрать вид календаря. Отвечаем «не телефон» — на десктопе страница открывает
// неделю, и путь через список остаётся тем же, что у владельца на планшете.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  })
}

const live = !!process.env.FIRESTORE_EMULATOR_HOST
const LESSON_ID = 'e2e-lesson'

const read = async (name) =>
  (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...d.data() }))

const lessonDoc = async () => {
  const snap = await getDoc(doc(db, 'lessons', LESSON_ID))
  return { id: snap.id, ...snap.data() }
}

// Поля ученика стоят в его строке журнала: занятие, питание, [бонус], комментарий.
const fieldsOf = (name) => {
  const row = screen.getByText(name).closest('div[style*="border"]')
  return [...row.querySelectorAll('input[type="text"]')]
}

// App.jsx не пускает на страницы, пока не загружен профиль: до этого права
// неизвестны, и страница приняла бы вошедшего за педагога — тот видит только
// свои занятия, то есть пустой список. Обёртка повторяет это условие, иначе
// прогон проверял бы не то приложение, которым пользуются.
function Gate({ children }) {
  const { user, profile } = useAuth()
  if (user === undefined || (user && profile === undefined)) return <div>Загрузка...</div>
  return children
}

const show = () => render(
  <MemoryRouter>
    <AuthProvider><Gate><Lessons /></Gate></AuthProvider>
  </MemoryRouter>,
)

describe.skipIf(!live)('сквозной прогон: провести занятие и откатить', () => {
  beforeAll(async () => {
    // Откат занятия спрашивает подтверждение, а jsdom окна не рисует.
    // Отвечаем «да» — иначе проверялся бы отказ от правки, а не сама правка.
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await signInWithEmailAndPassword(auth, 'e2e@example.com', 'sandbox123')
  }, 30000)

  afterEach(cleanup)

  afterAll(async () => {
    cleanup()
    stopAllLive()
    await signOut(auth)
  })

  it('журнал доезжает до базы: занятие, начисления, бонусы, баланс', async () => {
    show()

    // Страница открывается календарём — сквозной путь идёт через список.
    fireEvent.click(await screen.findByText('Список', {}, { timeout: 20000 }))
    fireEvent.click(await screen.findByText('Провести', {}, { timeout: 20000 }))

    // Аня: занятие 300 000 + питание 20 000, из них 50 000 закрыты бонусом.
    // У неё есть бонусы, поэтому полей четыре, а у Бори — три.
    const anya = fieldsOf('Аня Тестова')
    expect(anya).toHaveLength(4)
    fireEvent.change(anya[0], { target: { value: '300000' } })
    fireEvent.change(anya[1], { target: { value: '20000' } })
    fireEvent.change(anya[2], { target: { value: '50000' } })

    const borya = fieldsOf('Боря Тестов')
    expect(borya).toHaveLength(3)
    fireEvent.change(borya[0], { target: { value: '250000' } })

    // Итог на экране: (300 000 + 20 000 − 50 000) + 250 000.
    expect(document.body.textContent.replace(/[\s,\u00a0]/g, '')).toContain('520000')

    fireEvent.click(screen.getByText('✓ Провести занятие'))

    await waitFor(async () => {
      expect((await lessonDoc()).status).toBe('conducted')
    }, { timeout: 20000 })

    const lesson = await lessonDoc()
    const byId = Object.fromEntries(lesson.attendance.map(a => [a.clientId, a]))
    expect(byId.anya).toMatchObject({
      status: 'present', amountCharged: 270000,
      amountLesson: 300000, amountMeal: 20000, amountBonus: 50000,
    })
    expect(byId.borya).toMatchObject({ status: 'present', amountCharged: 250000 })

    // Начисления: сумма — итог со скидкой, разбивка и бонус едут справкой.
    // Без этого отчёт по приглашениям показывал бы нулевой расход на бонусы.
    const charges = await read('charges')
    const chargeOf = (id) => charges.find(c => c.clientId === id && c.lessonId === LESSON_ID)
    expect(chargeOf('anya')).toMatchObject({
      amount: 270000, amountLesson: 300000, amountMeal: 20000, amountBonus: 50000, lessons: 1,
    })
    expect(chargeOf('borya')).toMatchObject({ amount: 250000, lessons: 1 })
    expect('amountBonus' in chargeOf('borya')).toBe(false)

    // Бонусы: трата записана, остаток уменьшился на неё.
    const bonuses = await read('bonuses')
    const spent = bonuses.filter(b => b.kind === 'spend' && b.lessonId === LESSON_ID)
    expect(spent).toHaveLength(1)
    expect(spent[0]).toMatchObject({ amount: 50000, clientId: 'anya', reason: 'lesson_discount' })
    const anyaClient = (await read('clients')).find(c => c.id === 'anya')
    expect(bonusBalanceOf(anyaClient, bonuses)).toBe(100000)

    // Балансы: у Ани 1 000 000 предоплаты минус списанные 270 000, Боря ушёл в долг.
    const transactions = await read('transactions')
    const balances = clientBalances(transactions, charges)
    expect(balances.get('anya')).toBe(730000)
    expect(balances.get('borya')).toBe(-250000)

    // Остаток в уроках выводится из денег: 730 000 при цене 300 000 — это два занятия.
    expect(lessonsLeft([], 'anya', balances.get('anya'), charges.filter(c => c.clientId === 'anya'), anyaClient)).toBe(2)

    // Отчёты: выручка по прайсу выше списанного ровно на подаренное.
    expect(chargesGross(charges)).toBe(570000)
    expect(bonusExpense(charges)).toBe(50000)

    // Бонус кассу не двигает: он не деньги, а скидка.
    expect(companyBalance(transactions)).toBe(1000000)
    const cash = accountTotals(transactions, await read('accounts')).find(a => a.id === 'cash')
    expect(cash.total).toBe(1000000)
    // Заработано: 520 000 списаний, расходов и зарплат нет.
    expect(realizedProfit(transactions, charges)).toBe(520000)
  }, 120000)

  // Правка проведённого занятия — самое опасное место: сумма живёт и в журнале,
  // и в начислении. Разъедутся — баланс ученика перестанет сходиться с журналом,
  // и заметят это не скоро.
  it('правка журнала меняет обе записи разом', async () => {
    show()

    fireEvent.click(await screen.findByText('Список', {}, { timeout: 20000 }))
    fireEvent.click(await screen.findByText('Проведённые', {}, { timeout: 20000 }))
    fireEvent.click(await screen.findByText('Изменить журнал', {}, { timeout: 20000 }))

    // У Бори было 250 000 одной суммой. Менеджер ошибся: занятие 200 000, еда 15 000.
    const borya = fieldsOf('Боря Тестов')
    fireEvent.change(borya[0], { target: { value: '200000' } })
    fireEvent.change(borya[1], { target: { value: '15000' } })

    fireEvent.click(screen.getByText('✓ Сохранить изменения'))

    await waitFor(async () => {
      const lesson = await lessonDoc()
      const row = lesson.attendance.find(a => a.clientId === 'borya')
      expect(row.amountCharged).toBe(215000)
    }, { timeout: 20000 })

    const lesson = await lessonDoc()
    expect(lesson.attendance.find(a => a.clientId === 'borya')).toMatchObject({
      amountCharged: 215000, amountLesson: 200000, amountMeal: 15000,
    })

    const charges = await read('charges')
    const borisCharges = charges.filter(c => c.clientId === 'borya' && c.lessonId === LESSON_ID)
    // Начисление обновилось, а не завелось вторым: иначе ученик заплатил бы дважды.
    expect(borisCharges).toHaveLength(1)
    expect(borisCharges[0]).toMatchObject({ amount: 215000, amountLesson: 200000, amountMeal: 15000 })

    // Журнал и лицевой счёт по-прежнему описывают одно и то же.
    const balances = clientBalances(await read('transactions'), charges)
    expect(balances.get('borya')).toBe(-215000)
    expect(balances.get('anya')).toBe(730000)

    // Чужую запись правка не задела.
    expect(charges.find(c => c.clientId === 'anya').amount).toBe(270000)
  }, 120000)

  it('«Вернуть в запланированные» возвращает и деньги, и бонусы', async () => {
    show()

    fireEvent.click(await screen.findByText('Список', {}, { timeout: 20000 }))
    fireEvent.click(await screen.findByText('Проведённые', {}, { timeout: 20000 }))
    fireEvent.click(await screen.findByText('Вернуть в запланированные', {}, { timeout: 20000 }))

    await waitFor(async () => {
      expect((await lessonDoc()).status).toBe('planned')
    }, { timeout: 20000 })

    const lesson = await lessonDoc()
    expect(lesson.attendance || []).toHaveLength(0)

    const charges = await read('charges')
    expect(charges.filter(c => c.lessonId === LESSON_ID)).toHaveLength(0)

    // Бонус вернулся на счёт: занятия нет — и скидки нет.
    const bonuses = await read('bonuses')
    expect(bonuses.filter(b => b.kind === 'spend' && b.lessonId === LESSON_ID)).toHaveLength(0)
    const anyaClient = (await read('clients')).find(c => c.id === 'anya')
    expect(bonusBalanceOf(anyaClient, bonuses)).toBe(150000)

    // Деньги ученика вернулись в предоплату, долг Бори закрылся.
    const balances = clientBalances(await read('transactions'), charges)
    expect(balances.get('anya')).toBe(1000000)
    expect(balances.get('borya') ?? 0).toBe(0)
  }, 120000)
})
