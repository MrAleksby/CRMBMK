import { useState } from 'react'
import { ATTENDANCE, journalTotal, validateJournal } from '../lib/lesson'

const inputStyle = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '6px 10px',
  color: '#111827',
  fontSize: '13px',
  outline: 'none',
  width: '130px',
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

  const update = (clientId, patch) =>
    setRows(rows.map(r => (r.clientId === clientId ? { ...r, ...patch } : r)))

  const handleConduct = () => {
    const problem = validateJournal(rows)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    onConduct(rows)
  }

  const total = journalTotal(rows)
  const presentCount = rows.filter(r => r.status === 'present').length

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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '12px', color: '#6b7280' }}>
        <span>Ученик</span>
        <span>Сумма за занятие (с питанием)</span>
      </div>

      {rows.map(row => {
        const present = row.status === 'present'
        return (
          <div key={row.clientId} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '10px', padding: '8px 0', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }}>
              <input type="checkbox" checked={present}
                onChange={() => update(row.clientId, { status: present ? 'absent' : 'present' })} />
              <span style={{ fontSize: '14px', color: '#111827', fontWeight: '500' }}>{row.clientName}</span>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                background: ATTENDANCE[row.status].background,
                color: ATTENDANCE[row.status].color,
              }}>{ATTENDANCE[row.status].label}</span>
            </label>

            {present ? (
              <input type="number" min="0" placeholder="Сумма" style={inputStyle}
                value={row.amount} onChange={e => update(row.clientId, { amount: e.target.value })} />
            ) : (
              <span style={{ fontSize: '13px', color: '#9ca3af', width: '130px', textAlign: 'right' }}>
                не списывается
              </span>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '13px', color: '#4b5563' }}>
          {editing ? 'Пришло' : 'Придёт'} {presentCount} из {rows.length}.{' '}
          {editing ? 'Списано' : 'Спишется'}{' '}
          <b style={{ color: '#111827' }}>{total.toLocaleString()} сум</b>
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
        }}>⚠️ {error}</p>
      )}
    </div>
  )
}
