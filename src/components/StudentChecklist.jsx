import { useState } from 'react'

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none', width: '100%',
}

// Список учеников с галочками. Используется и в занятии, и в группе.
export default function StudentChecklist({ clients, selected, onToggle, maxHeight = '220px' }) {
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const visible = query
    ? clients.filter(c => String(c.childName || '').toLowerCase().includes(query))
    : clients

  return (
    <div>
      <input style={{ ...inputStyle, marginBottom: '8px' }} placeholder="🔍 Найти ученика"
        value={search} onChange={e => setSearch(e.target.value)} />
      <div style={{
        maxHeight, overflowY: 'auto', background: '#ffffff',
        border: '1px solid #e5e7eb', borderRadius: '10px', padding: '6px',
      }}>
        {visible.map(c => (
          <label key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px',
            cursor: 'pointer', fontSize: '13px', color: '#111827',
          }}>
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />
            {c.childName}
          </label>
        ))}
        {visible.length === 0 && (
          <p style={{ fontSize: '13px', color: '#6b7280', padding: '8px' }}>Никого не найдено</p>
        )}
      </div>
    </div>
  )
}
