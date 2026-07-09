import { useState } from 'react'
import { attendanceTile, lessonTypeLabel, formatLessonDate } from '../lib/lesson'
import { LESSON_STATUSES } from '../lib/group'
import { durationMinutes } from '../lib/calendar'

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

const notSet = { color: '#dc2626', fontStyle: 'italic' }

// Всплывает при наведении: где был ребёнок, с кем и на сколько списано.
function LessonPopover({ lesson, clients, teachers }) {
  const status = LESSON_STATUSES[lesson.status] ?? LESSON_STATUSES.planned
  const teacher = teachers.find(t => t.id === lesson.teacherId)
  const attendance = lesson.attendance || []

  const names = attendance.length > 0
    ? attendance.map(a => ({
        name: a.clientName,
        amount: a.amountCharged,
        absent: a.status !== 'present',
      }))
    : (lesson.studentIds || []).map(sid => ({
        name: clients.find(c => c.id === sid)?.childName || 'Ученик',
        amount: null,
        absent: false,
      }))

  const row = { display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', padding: '3px 0', fontSize: '12px' }

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: '6px',
      background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px',
      boxShadow: '0 10px 24px rgba(17, 24, 39, 0.12)', padding: '12px 14px',
      width: '280px', textAlign: 'left', cursor: 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>
          {lessonTypeLabel(lesson.type)}
        </span>
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
          background: status.background, color: status.color,
        }}>{status.label}</span>
      </div>

      <div style={row}>
        <span style={{ color: '#6b7280' }}>Дата</span>
        <span style={{ color: '#111827' }}>{formatLessonDate(lesson.date)}</span>
      </div>
      <div style={row}>
        <span style={{ color: '#6b7280' }}>Время</span>
        <span style={{ color: '#111827' }}>
          {lesson.timeFrom}–{lesson.timeTo}
          <span style={{ color: '#6b7280' }}> ({durationMinutes(lesson)} мин.)</span>
        </span>
      </div>
      <div style={row}>
        <span style={{ color: '#6b7280' }}>Группа</span>
        {lesson.groupName
          ? <span style={{ color: '#111827' }}>{lesson.groupName}</span>
          : <span style={notSet}>(без группы)</span>}
      </div>
      <div style={row}>
        <span style={{ color: '#6b7280' }}>Педагог</span>
        {teacher
          ? <span style={{ color: '#111827' }}>{teacher.name}</span>
          : <span style={notSet}>(не задан)</span>}
      </div>

      <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '8px', paddingTop: '8px' }}>
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
          Кто был ({names.length})
        </div>
        {names.slice(0, 10).map((person, i) => (
          <div key={`${person.name}-${i}`} style={{
            display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', padding: '2px 0',
          }}>
            <span style={{ color: person.absent ? '#9ca3af' : '#111827', textDecoration: person.absent ? 'line-through' : 'none' }}>
              {person.name}
            </span>
            {person.amount !== null && (
              <span style={{ color: person.amount > 0 ? '#dc2626' : '#9ca3af', whiteSpace: 'nowrap' }}>
                {person.amount > 0 ? `${person.amount.toLocaleString()} сум` : '—'}
              </span>
            )}
          </div>
        ))}
        {names.length > 10 && (
          <div style={{ fontSize: '11px', color: '#6b7280' }}>…и ещё {names.length - 10}</div>
        )}
      </div>

      <p style={{ fontSize: '11px', color: '#7c3aed', marginTop: '8px' }}>
        Нажмите, чтобы открыть и отредактировать
      </p>
    </div>
  )
}

function Tile({ lesson, tile, clients, teachers, onOpen }) {
  const [hover, setHover] = useState(false)
  const [, month, day] = lesson.date.split('-')

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div onClick={() => onOpen(lesson)} title={tile.title} style={{
        minWidth: '52px', padding: '6px 4px', borderRadius: '8px', textAlign: 'center',
        background: tile.background,
        border: tile.dashed ? '1px dashed #dc2626' : '1px solid transparent',
        color: tile.color, cursor: 'pointer',
        textDecoration: tile.strike ? 'line-through' : 'none',
      }}>
        <div style={{ fontSize: '11px', height: '14px' }}>{tile.icon}</div>
        <div style={{ fontSize: '12px', fontWeight: '600' }}>{day}.{month}</div>
      </div>

      {hover && <LessonPopover lesson={lesson} clients={clients} teachers={teachers} />}
    </div>
  )
}

export default function AttendanceWidget({ lessons, clients, teachers = [], clientId, onOpenLesson }) {
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
          <Tile key={lesson.id} lesson={lesson} tile={attendanceTile(lesson, clientId)}
            clients={clients} teachers={teachers} onOpen={onOpenLesson} />
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
