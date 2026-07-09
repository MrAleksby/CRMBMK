// Журнал занятия: кто пришёл и сколько с него списать.
// Сумма у каждого ученика своя и всегда редактируемая — менеджер вводит её вручную,
// уже с питанием, если ребёнок ел. Система лишь подставляет подсказку.

export const ATTENDANCE = {
  present: { label: 'Пришёл', color: '#059669', background: '#dcfce7' },
  absent: { label: 'Пропуск', color: '#b45309', background: '#fef3c7' },
}

export const LESSON_TYPES = [
  { value: 'group', label: 'Групповой' },
  { value: 'individual', label: 'Индивидуальный' },
  { value: 'trial', label: 'Пробный' },
]

// Подсказка суммы: персональная цена ребёнка.
// Когда появятся абонементы (Фаза 4), первым в цепочке встанет их расчёт.
export function suggestedPrice(client) {
  return Number.isFinite(client?.lessonPrice) ? client.lessonPrice : ''
}

export function buildJournal(lesson, clients) {
  const saved = new Map((lesson.attendance || []).map(a => [a.clientId, a]))
  const ids = lesson.studentIds || []

  return ids.map(clientId => {
    const client = clients.find(c => c.id === clientId)
    const previous = saved.get(clientId)
    return {
      clientId,
      clientName: client?.childName || 'Удалённый ученик',
      status: previous?.status || 'present',
      amount: previous
        ? String(previous.amountCharged ?? '')
        : String(suggestedPrice(client) ?? ''),
    }
  })
}

// Итог журнала: сколько ученик заплатит за это занятие.
// У отсутствующих сумма не берётся — пропустил, значит не платит.
export function journalToAttendance(rows) {
  return rows.map(row => ({
    clientId: row.clientId,
    clientName: row.clientName,
    status: row.status,
    amountCharged: row.status === 'present' ? (Number(row.amount) || 0) : 0,
  }))
}

export function validateJournal(rows) {
  for (const row of rows) {
    if (row.status !== 'present') continue
    if (row.amount === '') return `Укажите сумму для «${row.clientName}»`
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      return `Сумма «${row.clientName}» должна быть неотрицательным числом`
    }
  }
  return null
}

export const journalTotal = (rows) =>
  rows.reduce((sum, r) => sum + (r.status === 'present' ? (Number(r.amount) || 0) : 0), 0)

export const lessonTypeLabel = (type) =>
  LESSON_TYPES.find(t => t.value === type)?.label || 'Групповой'

export function formatLessonDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Состояние плитки в виджете посещений.
// Цвет говорит о деньгах, значок — о факте, как в AlfaCRM.
export function attendanceTile(lesson, clientId) {
  const record = (lesson.attendance || []).find(a => a.clientId === clientId)
  const today = new Date().toISOString().slice(0, 10)

  if (lesson.status === 'cancelled') {
    return { icon: '⊖', background: '#f3f4f6', color: '#9ca3af', strike: true, title: 'Отменён' }
  }
  if (lesson.status === 'conducted') {
    if (record?.status === 'absent') {
      return { icon: '✗', background: '#fef3c7', color: '#b45309', title: 'Пропуск' }
    }
    const paid = (record?.amountCharged ?? 0) > 0
    return paid
      ? { icon: '✓', background: '#dcfce7', color: '#059669', title: `Проведён, ${record.amountCharged.toLocaleString()} сум` }
      : { icon: '✓', background: '#fef3c7', color: '#b45309', title: 'Проведён бесплатно' }
  }
  if (lesson.date < today) {
    return { icon: '?', background: '#ffffff', color: '#dc2626', dashed: true, title: 'Забыли провести?' }
  }
  return { icon: '', background: '#f3f4f6', color: '#4b5563', title: 'Запланирован' }
}
