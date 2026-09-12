// Окно занятия из календаря («Кто был?») — второе место, где рисуется журнал.
//
// 6 сентября 2026 оно осталось со старым полем `amount`, которого в строке
// журнала уже не было. Менеджер вводил суммы, а система их не видела: жаловалась
// «Укажите сумму», а при удачном проведении списала бы подставленную подсказку
// вместо введённого — то есть неверные деньги на счетах детей.
//
// Логические тесты этого не ловили: там всё сходилось. Ловится только отрисовкой
// настоящего окна и вводом в настоящие поля — что здесь и делается.

/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LessonModal from './LessonModal'

const lesson = {
  id: 'l1', date: '2026-09-06', timeFrom: '11:00', timeTo: '16:00',
  status: 'planned', type: 'group', groupName: 'Группа вскр',
  studentIds: ['a', 'b'], attendance: [],
}
const clients = [
  { id: 'a', childName: 'Аня', lessonPrice: 300000 },
  { id: 'b', childName: 'Боря' },            // без персональной цены — подсказки не будет
]

const show = (props = {}) => render(
  <MemoryRouter>
    <LessonModal
      lesson={lesson} clients={clients} subscriptions={[]} teachers={[]}
      balances={{ a: 0, b: 0 }} lessonsLeftBy={{}}
      onClose={() => {}} onConduct={() => {}} onReturn={() => {}}
      onCancelLesson={() => {}} onSaveStudents={() => {}}
      {...props}
    />
  </MemoryRouter>,
)

const fieldsOf = (name) => {
  // Поля стоят в строке ученика; берём строку таблицы по имени.
  const row = screen.getByText(name).closest('tr')
  return row.querySelectorAll('input[type="text"]')
}

beforeEach(cleanup)

describe('окно занятия: ввод сумм', () => {
  it('у каждого ученика три поля: занятие, питание, комментарий', () => {
    show()

    expect(fieldsOf('Аня')).toHaveLength(3)
    expect(fieldsOf('Боря')).toHaveLength(3)
  })

  it('подсказка цены попадает в «Занятие», питание остаётся пустым', () => {
    show()
    const [lessonField, mealField] = fieldsOf('Аня')

    expect(lessonField.value).toBe('300000')
    expect(mealField.value).toBe('')
  })

  it('введённое менеджером попадает в итог — то, чего не делало старое окно', () => {
    show()
    const [lessonField, mealField] = fieldsOf('Боря')

    fireEvent.change(lessonField, { target: { value: '250000' } })
    fireEvent.change(mealField, { target: { value: '30000' } })

    // 300 000 у Ани + 280 000 у Бори. Раньше ввод уходил в никуда, и здесь
    // осталась бы одна подсказка — 300 000.
    // Разделитель разрядов сравнивать нельзя: в Node он не тот, что в браузере.
    const shown = document.body.textContent.replace(/[\s,\u00a0]/g, '')
    expect(shown).toContain('580000')
    expect(shown).not.toContain('Спишется:300000')
  })

  it('проведение отдаёт ровно введённые суммы, а не подсказки', () => {
    const onConduct = vi.fn()
    show({ onConduct })
    const [lessonField, mealField] = fieldsOf('Аня')

    fireEvent.change(lessonField, { target: { value: '400000' } })
    fireEvent.change(mealField, { target: { value: '20000' } })
    fireEvent.change(fieldsOf('Боря')[0], { target: { value: '250000' } })
    fireEvent.click(screen.getByText(/Провести/))

    expect(onConduct).toHaveBeenCalledTimes(1)
    const rows = onConduct.mock.calls[0][1]
    const anya = rows.find(r => r.clientName === 'Аня')
    expect(anya.amountLesson).toBe('400000')
    expect(anya.amountMeal).toBe('20000')
  })

  it('не заполнил — занятие не проводится, и сказано, у кого именно', () => {
    const onConduct = vi.fn()
    show({ onConduct })
    // У Бори подсказки нет, поле пустое.
    fireEvent.click(screen.getByText(/Провести/))

    expect(onConduct).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Боря')
  })
})

// Проведённое занятие: окно должно показывать списанное, а не «не списано».
//
// 12 сентября 2026 владелец открыл проведённый урок — из календаря и по плитке
// в карточке ученика — и против каждого ребёнка увидел «не списано», хотя
// деньги списаны и итог внизу верный. Причина: строку рисовали через
// `attendanceToRow`, а она готовит поля ввода и итога `amountCharged` не несёт.
describe('окно занятия: проведённое', () => {
  const conducted = {
    ...lesson,
    status: 'conducted',
    attendance: [
      { clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 320000, amountLesson: 300000, amountMeal: 20000, comment: 'добавка' },
      { clientId: 'b', clientName: 'Боря', status: 'absent', amountCharged: 0, comment: '' },
    ],
  }

  const textOf = (name) => screen.getByText(name).closest('tr').textContent.replace(/[\s,\u00a0]/g, '')

  // Три колонки строки: занятие, питание, комментарий.
  const cellsOf = (name) => [...screen.getByText(name).closest('tr')
    .querySelectorAll('td:last-child > div > span')]
    .map(el => el.textContent.replace(/[\s,\u00a0]/g, ''))

  it('у ученика стоят списанные суммы, а не «не списано»', () => {
    show({ lesson: conducted })

    expect(textOf('Аня')).toContain('300000')
    expect(textOf('Аня')).not.toContain('несписано')
  })

  it('занятие, питание и комментарий стоят каждое в своей колонке', () => {
    show({ lesson: conducted })
    const cells = cellsOf('Аня')

    expect(cells[0]).toBe('300000')
    expect(cells[1]).toBe('20000')
    expect(cells[2]).toBe('добавка')
  })

  it('у прощённого пропуска прочерки в обеих суммах', () => {
    show({ lesson: conducted })
    const cells = cellsOf('Боря')

    expect(cells[0]).toBe('—')
    expect(cells[1]).toBe('—')
    expect(cells[2]).toBe('')
  })

  it('у занятия без разбивки в питании прочерк, а не ноль', () => {
    show({ lesson: { ...conducted, attendance: [
      { clientId: 'a', clientName: 'Аня', status: 'present', amountCharged: 320000 },
    ] } })
    const cells = cellsOf('Аня')

    expect(cells[0]).toBe('320000')
    expect(cells[1]).toBe('—')
  })

  it('подписи колонок стоят в том же порядке, что и значения', () => {
    show({ lesson: conducted })
    const head = [...document.querySelectorAll('thead th')].at(-1).textContent

    expect(head).toBe('ЗанятиеПитаниеКомментарий')
  })

  it('итог внизу сходится с суммами в строках', () => {
    show({ lesson: conducted })

    const shown = document.body.textContent.replace(/[\s,\u00a0]/g, '')
    expect(shown).toContain('Списано:320000сум')
  })
})
