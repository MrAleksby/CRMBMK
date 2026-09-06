import { useState } from 'react'
import { ATTENDANCE, journalTotal, journalMealTotal, journalProblems, rowTotal, validateJournal } from '../lib/lesson'

// Поля подписаны, а не помечены только подсказкой внутри. Подсказка исчезает,
// как только в поле что-то введено, и на планшете, где поля переносятся на
// вторую строку, становится непонятно, где занятие, а где питание.
// 6 сентября 2026 владелец на это и наткнулся: «не выходят поля».
const inputStyle = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '8px 10px',
  color: '#111827',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
}

const fieldLabel = {
  display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '3px',
}

const btn = (color = '#7c3aed') => ({
  background: color, color: '#fff', border: 'none', padding: '8px 16px',
  borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

const ghostBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '8px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
}

export default function LessonJournal({ rows: initialRows, saving, editing = false, onConduct, onCancel }) {
  const [rows, setRows] = useState(initialRows)
  const [error, setError] = useState('')
  // Кого именно не хватило. Держим отдельно от текста ошибки: при двенадцати
  // детях прочитать список имён в одну строку трудно, а подсвеченную строку
  // видно сразу.
  const [missing, setMissing] = useState(() => new Set())

  const update = (clientId, patch) => {
    setRows(rows.map(r => (r.clientId === clientId ? { ...r, ...patch } : r)))
    // Начал исправлять — снимаем подсветку с этой строки, не дожидаясь
    // повторного нажатия «Провести».
    if (missing.has(clientId)) {
      const next = new Set(missing)
      next.delete(clientId)
      setMissing(next)
    }
  }

  const handleConduct = () => {
    const problem = validateJournal(rows)
    if (problem) {
      setError(problem)
      setMissing(new Set(journalProblems(rows).map(p => p.clientId)))
      return
    }
    setError('')
    setMissing(new Set())
    onConduct(rows)
  }

  const total = journalTotal(rows)
  const mealTotal = journalMealTotal(rows)
  const presentCount = rows.filter(r => r.status === 'present').length
  const paidSkips = rows.filter(r => r.status !== 'present' && rowTotal(r) > 0).length

  if (rows.length === 0) {
    return (
      <div style={{ padding: '16px', background: '#f7f8fa', borderRadius: '12px' }}>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          В занятии нет учеников. Добавьте их в группу или в само занятие.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: '#f7f8fa', borderRadius: '12px', padding: '14px' }}>
     {rows.map(row => {
        const present = row.status === 'present'
        const flagged = missing.has(row.clientId)
        return (
          <div key={row.clientId} style={{
            padding: '10px',
            marginBottom: '8px',
            borderRadius: '10px',
            // Подсвечиваем строку целиком: имя в тексте ошибки ещё надо найти
            // глазами в списке, а цветную строку видно сразу.
            background: flagged ? '#fef2f2' : '#ffffff',
            border: `1px solid ${flagged ? '#fecaca' : '#e5e7eb'}`,
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              cursor: 'pointer', marginBottom: '8px', flexWrap: 'wrap',
            }}>
              <input type="checkbox" checked={present}
                onChange={() => update(row.clientId, { status: present ? 'absent' : 'present' })} />
              <span style={{ fontSize: '14px', color: '#111827', fontWeight: '500' }}>{row.clientName}</span>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                background: ATTENDANCE[row.status].background,
                color: ATTENDANCE[row.status].color,
              }}>{ATTENDANCE[row.status].label}</span>
              <span style={{
                marginLeft: 'auto', fontSize: '13px', fontWeight: '600',
                color: rowTotal(row) > 0 ? '#111827' : '#9ca3af',
              }}>
                Итого: {rowTotal(row) > 0 ? `${rowTotal(row).toLocaleString()} сум` : '—'}
              </span>
            </label>

           {/* Сетка вместо ряда: на узком экране поля встают друг под друга
                предсказуемо, а не переносятся как придётся.
                У отсутствующего суммы тоже вводятся: пропуск без предупреждения
                руководитель может решить списать. Пусто — значит прощён.
                На лицевой счёт уходит ИТОГ, разбивка нужна, чтобы видеть еду. */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '8px',
            }}>
              <div>
                <label style={fieldLabel}>Занятие</label>
                <input type="text" inputMode="decimal" style={inputStyle}
                  placeholder={present ? 'Сумма' : 'Не списывать'}
                  title={present ? 'Сумма за занятие' : 'Пропуск: оставьте пустым, если причина уважительная'}
                  value={row.amountLesson} onChange={e => update(row.clientId, { amountLesson: e.target.value })} />
              </div>
              <div>
                <label style={fieldLabel}>Питание</label>
                <input type="text" inputMode="decimal" style={inputStyle}
                  placeholder="Сумма" title="Сумма за питание"
                  value={row.amountMeal} onChange={e => update(row.clientId, { amountMeal: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fieldLabel}>Комментарий</label>
                <input type="text" style={inputStyle}
                  placeholder="Необязательно"
                  value={row.comment} onChange={e => update(row.clientId, { comment: e.target.value })} />
              </div>
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '13px', color: '#4b5563' }}>
         {editing ? 'Пришло' : 'Придёт'} {presentCount} из {rows.length}.{' '}
         {editing ? 'Списано' : 'Спишется'}{' '}
          <b style={{ color: '#111827' }}>{total.toLocaleString()} сум</b>
         {mealTotal > 0 && (
            <span style={{ color: '#6b7280' }}>{' '}· из них питание {mealTotal.toLocaleString()}</span>
          )}
         {paidSkips > 0 && (
            <span style={{ color: '#b45309' }}>
             {' '}· платных пропусков: {paidSkips}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleConduct} disabled={saving} style={{ ...btn('#059669'), opacity: saving ? 0.6 : 1 }}>
           {saving
              ? (editing ? 'Сохраняем...' : 'Проводим...')
              : (editing ? '✓ Сохранить изменения' : '✓ Провести занятие')}
          </button>
          <button onClick={onCancel} style={ghostBtn}>Отмена</button>
        </div>
      </div>

     {editing && (
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
          Правка пересчитает начисления на лицевых счетах и остатки по абонементам.
        </p>
      )}

     {error && (
        <p style={{
          background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
          borderRadius: '10px', padding: '8px 12px', fontSize: '13px', marginTop: '12px',
        }}> {error}</p>
      )}
    </div>
  )
}
