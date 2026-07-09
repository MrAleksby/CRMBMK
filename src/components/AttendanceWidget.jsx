import { attendanceTile } from '../lib/lesson'

// Плитки посещений: цвет говорит о деньгах, значок — о факте.
// Точно так же читается виджет в AlfaCRM.
const LEGEND = [
  { icon: '', background: '#f3f4f6', color: '#4b5563', label: 'Запланирован' },
  { icon: '✓', background: '#dcfce7', color: '#059669', label: 'Проведён и оплачен' },
  { icon: '✓', background: '#fef3c7', color: '#b45309', label: 'Проведён бесплатно' },
  { icon: '✗', background: '#fef3c7', color: '#b45309', label: 'Пропуск' },
  { icon: '?', background: '#ffffff', color: '#dc2626', dashed: true, label: 'Забыли провести' },
  { icon: '⊖', background: '#f3f4f6', color: '#9ca3af', strike: true, label: 'Отменён' },
]

function Tile({ tile, date }) {
  const [, month, day] = date.split('-')
  return (
    <div title={tile.title} style={{
      minWidth: '52px', padding: '6px 4px', borderRadius: '8px', textAlign: 'center',
      background: tile.background,
      border: tile.dashed ? '1px dashed #dc2626' : '1px solid transparent',
      color: tile.color,
      textDecoration: tile.strike ? 'line-through' : 'none',
    }}>
      <div style={{ fontSize: '11px', height: '14px' }}>{tile.icon}</div>
      <div style={{ fontSize: '12px', fontWeight: '600' }}>{day}.{month}</div>
    </div>
  )
}

export default function AttendanceWidget({ lessons, clientId }) {
  const mine = lessons
    .filter(l => (l.studentIds || []).includes(clientId))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (mine.length === 0) {
    return (
      <div style={{
        padding: '20px', background: '#f7f8fa', borderRadius: '12px',
        textAlign: 'center', color: '#6b7280', fontSize: '13px',
      }}>
        Занятий пока нет. Добавьте ученика в группу или создайте разовое занятие.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {mine.map(lesson => (
          <Tile key={lesson.id} date={lesson.date} tile={attendanceTile(lesson, clientId)} />
        ))}
      </div>

      <details>
        <summary style={{ fontSize: '12px', color: '#7c3aed', cursor: 'pointer' }}>Показать легенду</summary>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
          {LEGEND.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '6px', fontSize: '11px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: item.background, color: item.color,
                border: item.dashed ? '1px dashed #dc2626' : '1px solid transparent',
                textDecoration: item.strike ? 'line-through' : 'none',
              }}>{item.icon || '—'}</div>
              <span style={{ fontSize: '12px', color: '#4b5563' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
