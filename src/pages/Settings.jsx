import { useState } from 'react'
import { DIRECTORIES } from '../lib/directories'
import DirectoryTable from '../components/DirectoryTable'
import MigrationPanel from '../components/MigrationPanel'

const MIGRATION = 'migration'

const tab = (isActive) => ({
  background: isActive ? '#ede9fe' : 'transparent',
  color: isActive ? '#7c3aed' : '#4b5563',
  border: `1px solid ${isActive ? '#ddd6fe' : '#e5e7eb'}`,
  padding: '8px 14px',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})

export default function Settings() {
  const [activeKey, setActiveKey] = useState(DIRECTORIES[0].key)
  const dir = DIRECTORIES.find(d => d.key === activeKey) ?? DIRECTORIES[0]

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>⚙️ Настройки</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
          Справочники: на них опираются уроки, абонементы и финансы
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {DIRECTORIES.map(d => (
          <button key={d.key} onClick={() => setActiveKey(d.key)} style={tab(d.key === activeKey)}>
            {d.icon} {d.label}
          </button>
        ))}
        <button onClick={() => setActiveKey(MIGRATION)} style={tab(activeKey === MIGRATION)}>
          🔄 Перенос финансов
        </button>
      </div>

      {activeKey === MIGRATION ? <MigrationPanel /> : <DirectoryTable dir={dir} />}
    </div>
  )
}
