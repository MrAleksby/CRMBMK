/* @vitest-environment jsdom */
//
// Сквозной прогон: приём денег через настоящую страницу «Финансы».
//
// Проверяется то же, что и у занятий, но с другой стороны: деньги. Менеджер
// вводит оплату в форму — а в базе должна появиться операция, и от неё должны
// сойтись касса, баланс ученика и метрики страницы.
//
//   npm run e2e
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { AuthProvider, useAuth } from '../AuthContext'
import { stopAllLive } from '../lib/store'
import Finance from '../pages/Finance'
import { clientBalances } from '../lib/balance'
import { companyBalance, accountTotals, incomeTotal } from '../lib/finance'

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  })
}

const live = !!process.env.FIRESTORE_EMULATOR_HOST

const read = async (name) =>
  (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...d.data() }))

// Поле формы по его подписи: label и input стоят рядом, но не связаны htmlFor.
const fieldByLabel = (text) => {
  const label = screen.getByText(text)
  return label.parentElement.querySelector('input, select')
}

function Gate({ children }) {
  const { user, profile } = useAuth()
  if (user === undefined || (user && profile === undefined)) return <div>Загрузка...</div>
  return children
}

const show = () => render(
  <MemoryRouter>
    <AuthProvider><Gate><Finance /></Gate></AuthProvider>
  </MemoryRouter>,
)

describe.skipIf(!live)('сквозной прогон: оплата через «Финансы»', () => {
  beforeAll(async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await signInWithEmailAndPassword(auth, 'e2e@example.com', 'sandbox123')
  }, 30000)

  afterEach(cleanup)

  afterAll(async () => {
    cleanup()
    stopAllLive()
    await signOut(auth)
  })

  it('оплата записывается в базу и сходится с кассой и балансом ученика', async () => {
    const before = await read('transactions')

    show()

    fireEvent.click(await screen.findByText('+ Добавить', {}, { timeout: 20000 }))

    // Доход — вид по умолчанию, но выбираем явно: так же делает менеджер.
    fireEvent.click(await screen.findByText('Доход', {}, { timeout: 20000 }))

    fireEvent.change(fieldByLabel('Сумма (сум) *'), { target: { value: '450000' } })
    fireEvent.change(fieldByLabel('Касса *'), { target: { value: 'cash' } })
    fireEvent.change(fieldByLabel('Статья *'), { target: { value: 'tuition' } })
    fireEvent.change(fieldByLabel('Ученик'), { target: { value: 'vitya' } })
    fireEvent.change(fieldByLabel('Комментарий'), { target: { value: 'Оплата за сентябрь' } })

    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(async () => {
      expect((await read('transactions')).length).toBe(before.length + 1)
    }, { timeout: 20000 })

    const transactions = await read('transactions')
    const added = transactions.find(t => !before.some(b => b.id === t.id))
    expect(added).toMatchObject({
      kind: 'income', amount: 450000, accountId: 'cash',
      categoryId: 'tuition', clientId: 'vitya', comment: 'Оплата за сентябрь',
    })
    // Дата обязана быть настоящей меткой времени, иначе операция выпадет
    // из любого отчёта по периоду.
    expect(typeof added.date?.toDate).toBe('function')

    // Деньги дошли до всех трёх мест сразу: касса, баланс компании, лицевой счёт.
    const accounts = await read('accounts')
    const charges = await read('charges')
    const cash = accountTotals(transactions, accounts).find(a => a.id === 'cash')

    expect(incomeTotal(transactions)).toBe(1450000)
    expect(cash.total).toBe(1450000)
    expect(companyBalance(transactions)).toBe(1450000)
    expect(clientBalances(transactions, charges).get('vitya')).toBe(450000)
  }, 120000)
})
