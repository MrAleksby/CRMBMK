import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAge, ageLabel } from '../lib/client'

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none', width: '100%',
}

// Список учеников с галочками. Используется и в занятии, и в группе.
// У тёзок возраст рядом с именем и ссылка на карточку помогают не перепутать,
// кого добавляешь в состав.
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
        {visible.map(c => {
          const age = getAge(c)
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px',
              fontSize: '13px', color: '#111827',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />
                <span>{c.childName}</span>
                {age !== null && <span style={{ color: '#9ca3af', fontSize: '12px' }}>· {ageLabel(age)}</span>}
              </label>
              {/* Открыть карточку в новой вкладке — различить тёзок, не теряя состав. */}
              <Link to={`/clients/${c.id}`} target="_blank" rel="noreferrer" title="Открыть карточку"
                style={{ color: '#7c3aed', textDecoration: 'none', fontSize: '13px', flexShrink: 0 }}>↗</Link>
            </div>
          )
        })}
        {visible.length === 0 && (
          <p style={{ fontSize: '13px', color: '#6b7280', padding: '8px' }}>Никого не найдено</p>
        )}
      </div>
    </div>
  )
}
