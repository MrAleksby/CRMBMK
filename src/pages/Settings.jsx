import { useState } from 'react'
import { DIRECTORIES } from '../lib/directories'
import DirectoryTable from '../components/DirectoryTable'

const tab = (isActive) => ({
  background: isActive ? '#2a2a3e' : 'transparent',
  color: isActive ? '#a78bfa' : '#9ca3af',
  border: `1px solid ${isActive ? '#3b3b52' : '#2a2a35'}`,
  padding: '8px 14px',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})

export default function Settings() {
  const [activeKey, setActiveKey] = useState(DIRECTORIES[0].key)
  const dir = DIRECTORIES.find(d => d.key === activeKey)

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>⚙️ Настройки</h2>
        <p style={{ fontSize: '14px', color: '#6b6b80', marginTop: '4px' }}>
          Справочники: на них опираются уроки, абонементы и финансы
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {DIRECTORIES.map(d => (
          <button key={d.key} onClick={() => setActiveKey(d.key)} style={tab(d.key === activeKey)}>
            {d.icon} {d.label}
          </button>
        ))}
      </div>

      <DirectoryTable dir={dir} />
    </div>
  )
}
