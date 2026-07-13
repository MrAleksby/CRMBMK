import { useState } from 'react'
import { DIRECTORIES } from '../lib/directories'
import { useAuth } from '../AuthContext'
import { isAdmin } from '../lib/access'
import DirectoryTable from '../components/DirectoryTable'
import MigrationPanel from '../components/MigrationPanel'
import AlfaImportPanel from '../components/AlfaImportPanel'
import StaffPanel from '../components/StaffPanel'
import Icon from '../components/Icon'

const MIGRATION = 'migration'
const IMPORT = 'import'
const STAFF = 'staff'

const tab = (isActive) => ({
  // inline-flex, а не иконка внутри строки: во flex-ряду кнопка сжимается,
  // и подпись срывается под картинку.
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 0,
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

  // Доступом управляет только админ. Правила Firestore проверяют то же самое,
  // так что скрытая вкладка — удобство, а не защита.
  const { user, profile } = useAuth()
  const admin = isAdmin(user?.uid, profile)

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="settings" size={20} style={{ color: '#6b7280' }} />Настройки
          </h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          Справочники: на них опираются уроки, абонементы и финансы
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
       {DIRECTORIES.map(d => (
          <button key={d.key} onClick={() => setActiveKey(d.key)} style={tab(d.key === activeKey)}>
            <Icon name={d.iconName} size={14} />{d.label}
          </button>
        ))}
        <button onClick={() => setActiveKey(MIGRATION)} style={tab(activeKey === MIGRATION)}>
          Перенос финансов
        </button>
        <button onClick={() => setActiveKey(IMPORT)} style={tab(activeKey === IMPORT)}>
          Импорт из AlfaCRM
        </button>
       {/* Не «Сотрудники»: так уже называется справочник педагогов. Здесь — вход в систему. */}
       {admin && (
          <button onClick={() => setActiveKey(STAFF)} style={tab(activeKey === STAFF)}>
            Доступ в систему
          </button>
        )}
      </div>

     {activeKey === MIGRATION ? <MigrationPanel />
        : activeKey === IMPORT ? <AlfaImportPanel />
        : activeKey === STAFF ? (admin ? <StaffPanel /> : null)
        : <DirectoryTable dir={dir} />}
    </div>
  )
}
