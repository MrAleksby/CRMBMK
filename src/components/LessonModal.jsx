import { useState } from 'react'
import { Link } from 'react-router-dom'
import StudentChecklist from './StudentChecklist'
import { LESSON_STATUSES } from '../lib/group'
import {
  buildJournal, journalTotal, validateJournal, lessonTypeLabel, formatLessonDate,
} from '../lib/lesson'
import { durationMinutes } from '../lib/calendar'

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.45)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '40px 16px', zIndex: 100, overflowY: 'auto',
}

const modal = {
  background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '720px',
  border: '1px solid #e5e7eb', overflow: 'hidden',
}

const header = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f7f8fa',
}

const body = { padding: '20px' }

const row = {
  display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px',
  padding: '8px 0', fontSize: '13px', alignItems: 'center',
}

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 10px', color: '#111827', fontSize: '13px', outline: 'none',
}

const btn = (color = '#7c3aed') => ({
  background: color, color: '#fff', border: 'none', padding: '9px 16px',
  borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

const ghostBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '9px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
}

const notSet = { color: '#dc2626', fontStyle: 'italic' }

// `readOnly` — карточка глазами педагога: состав и кто был, но ни сумм, ни
// балансов, ни кнопок. Списание — это деньги, их вводит менеджер.
export default function LessonModal({
  lesson, clients, teachers, balances, lessonsLeftBy = {}, subscriptions = [], saving,
  onClose, onConduct, onReturn, onCancelLesson, onSaveStudents, readOnly = false,
}) {
  const conducted = lesson.status === 'conducted'
  const [rows, setRows] = useState(() => buildJournal(lesson, clients, subscriptions))
  const [students, setStudents] = useState(lesson.studentIds || [])
  const [editingStudents, setEditingStudents] = useState(false)
  const [error, setError] = useState('')

  const status = LESSON_STATUSES[lesson.status] ?? LESSON_STATUSES.planned
  const teacher = teachers.find(t => t.id === lesson.teacherId)

  const update = (clientId, patch) =>
    setRows(rows.map(r => (r.clientId === clientId ? { ...r, ...patch } : r)))

  const handleConduct = () => {
    const problem = validateJournal(rows)
    if (problem) return setError(problem)
    setError('')
    onConduct(lesson, rows)
  }

  const toggleStudent = (id) =>
    setStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const handleSaveStudents = async () => {
    await onSaveStudents(lesson, students)
    setEditingStudents(false)
  }

  // Проведённое занятие показываем как есть, запланированное — как журнал.
  const displayRows = conducted
    ? (lesson.attendance || []).map(a => ({ ...a, amount: String(a.amountCharged ?? 0) }))
    : rows

  const total = conducted
    ? (lesson.attendance || []).reduce((s, a) => s + (a.amountCharged || 0), 0)
    : journalTotal(rows)

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>
             {lessonTypeLabel(lesson.type)}
            </span>
            <span style={{
              fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
              background: status.background, color: status.color,
            }}>{status.label}</span>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: '18px',
            color: '#6b7280', cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={body}>
          <div style={row}>
            <span style={{ color: '#6b7280' }}>Дата и время</span>
            <span style={{ color: '#111827' }}>
             {formatLessonDate(lesson.date)} · с {lesson.timeFrom} до {lesson.timeTo}
              <span style={{ color: '#6b7280' }}> ({durationMinutes(lesson)} мин.)</span>
            </span>
          </div>
          <div style={row}>
            <span style={{ color: '#6b7280' }}>Педагог</span>
           {teacher
              ? <span style={{ color: '#111827' }}>{teacher.name}</span>
              : <span style={notSet}>(не задан)</span>}
          </div>
          <div style={row}>
            <span style={{ color: '#6b7280' }}>Группа</span>
           {lesson.groupName
              ? <span style={{ color: '#111827' }}>{lesson.groupName}</span>
              : <span style={notSet}>(без группы)</span>}
          </div>
         {lesson.topic && (
            <div style={row}>
              <span style={{ color: '#6b7280' }}>Тема</span>
              <span style={{ color: '#111827' }}>{lesson.topic}</span>
            </div>
          )}

         {/* Состав */}
          <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                Кто был? ({displayRows.length})
              </span>
             {!conducted && !readOnly && (
                <button onClick={() => setEditingStudents(!editingStudents)} style={ghostBtn}>
                 {editingStudents ? 'Готово' : 'Изменить состав'}
                </button>
              )}
            </div>

           {editingStudents ? (
              <>
                <StudentChecklist clients={clients} selected={students} onToggle={toggleStudent} maxHeight="200px" />
                <button onClick={handleSaveStudents} disabled={saving}
                  style={{ ...btn(), marginTop: '10px', opacity: saving ? 0.6 : 1 }}>
                  Сохранить состав
                </button>
              </>
            ) : displayRows.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#6b7280' }}>Учеников нет — добавьте их в состав.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 0', color: '#6b7280', fontSize: '12px', fontWeight: '600' }}>
                      Состояние клиента
                    </th>
                   {!readOnly && (
                      <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontSize: '12px', fontWeight: '600', width: '150px' }}>
                        Списание
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                 {displayRows.map(record => {
                    const present = record.status === 'present'
                    const balance = balances?.[record.clientId] ?? 0
                    const left = lessonsLeftBy?.[record.clientId] ?? 0
                    return (
                      <tr key={record.clientId} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" checked={present} disabled={conducted || readOnly}
                              onChange={() => update(record.clientId, { status: present ? 'absent' : 'present' })} />
                           {/* Имя ведёт на карточку ученика — у тёзок так видно, кто это.
                                Новая вкладка, чтобы не потерять журнал занятия. */}
                            <Link to={`/clients/${record.clientId}`} target="_blank" rel="noreferrer"
                              style={{ color: (!readOnly && balance < 0) ? '#dc2626' : '#7c3aed', textDecoration: 'none' }}>
                             {record.clientName}
                            </Link>
                           {/* Остаток и долг — деньги: педагогу их не показываем. */}
                           {!readOnly && (
                              <span style={{ fontSize: '12px', color: balance < 0 ? '#dc2626' : '#6b7280' }}>
                                ({left > 0 ? `${left} ост` : `${balance.toLocaleString()} сум`})
                              </span>
                            )}
                          </div>
                        </td>
                       {!readOnly && (
                        <td style={{ padding: '8px 0', textAlign: 'right' }}>
                         {conducted ? (
                            <span style={{ color: record.amountCharged > 0 ? '#dc2626' : '#9ca3af' }}>
                             {record.amountCharged > 0 ? `−${record.amountCharged.toLocaleString()} сум` : 'не списано'}
                            </span>
                          ) : (
                            // Пропуск тоже может стоить денег, если ребёнок не предупредил.
                            <input type="number" min="0" inputMode="numeric"
                              style={{ ...inputStyle, width: '120px', textAlign: 'right' }}
                              value={record.amount}
                              placeholder={present ? 'Сумма' : 'Не списывать'}
                              onChange={e => update(record.clientId, { amount: e.target.value })} />
                          )}
                        </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

           {!readOnly && !editingStudents && displayRows.length > 0 && (
              <p style={{ fontSize: '13px', color: '#4b5563', marginTop: '12px' }}>
               {conducted ? 'Списано' : 'Спишется'}:{' '}
                <b style={{ color: '#111827' }}>{total.toLocaleString()} сум</b>
              </p>
            )}
          </div>

         {error && (
            <p style={{
              background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
              borderRadius: '10px', padding: '8px 12px', fontSize: '13px', marginTop: '12px',
            }}> {error}</p>
          )}
        </div>

        <div style={{
          display: 'flex', gap: '10px', padding: '14px 20px',
          borderTop: '1px solid #e5e7eb', background: '#f7f8fa', flexWrap: 'wrap',
        }}>
         {!readOnly && lesson.status === 'planned' && !editingStudents && (
            <>
              <button onClick={handleConduct} disabled={saving || displayRows.length === 0}
                style={{ ...btn('#059669'), opacity: (saving || displayRows.length === 0) ? 0.6 : 1 }}>
                ✓ {saving ? 'Проводим...' : 'Провести'}
              </button>
              <button onClick={() => onCancelLesson(lesson)} style={ghostBtn}>Отменить занятие</button>
            </>
          )}
         {!readOnly && conducted && (
            <button onClick={() => onReturn(lesson)} disabled={saving} style={ghostBtn}>
              ↩ Вернуть в запланированные
            </button>
          )}
          <button onClick={onClose} style={{ ...ghostBtn, marginLeft: 'auto' }}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
