import { useState } from 'react'
import { LESSON_TYPES } from '../lib/lesson'
import { todayISO } from '../lib/group'
import { isTeacher } from '../lib/directories'

const inputStyle = {
  background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none', width: '100%',
}

const labelStyle = { fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }

const emptyForm = () => ({
  date: todayISO(),
  timeFrom: '11:00',
  timeTo: '12:00',
  type: 'individual',
  teacherId: '',
  topic: '',
  studentIds: [],
})

export default function LessonForm({ clients, teachers, saving, onSubmit, onCancel }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const toggleStudent = (id) => {
    const studentIds = form.studentIds.includes(id)
      ? form.studentIds.filter(s => s !== id)
      : [...form.studentIds, id]
    setForm({ ...form, studentIds })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.date) return setError('Укажите дату занятия')
    if (form.timeTo <= form.timeFrom) return setError('Время окончания должно быть позже начала')
    if (form.studentIds.length === 0) return setError('Выберите хотя бы одного ученика')
    setError('')
    onSubmit(form)
  }

  const query = search.trim().toLowerCase()
  const visible = query
    ? clients.filter(c => String(c.childName || '').toLowerCase().includes(query))
    : clients

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#ffffff', border: '1px solid #e5e7eb',
      borderRadius: '16px', padding: '20px', marginBottom: '16px',
    }}>
      <h3 style={{ color: '#111827', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
        Разовое занятие
      </h3>

      <div style={grid}>
        <div>
          <label style={labelStyle}>Дата *</label>
          <input required type="date" style={inputStyle} value={form.date} onChange={set('date')} />
        </div>
        <div>
          <label style={labelStyle}>Начало</label>
          <input type="time" style={inputStyle} value={form.timeFrom} onChange={set('timeFrom')} />
        </div>
        <div>
          <label style={labelStyle}>Окончание</label>
          <input type="time" style={inputStyle} value={form.timeTo} onChange={set('timeTo')} />
        </div>
        <div>
          <label style={labelStyle}>Тип</label>
          <select style={inputStyle} value={form.type} onChange={set('type')}>
            {LESSON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Педагог</label>
          <select style={inputStyle} value={form.teacherId} onChange={set('teacherId')}>
            <option value="">Не выбран</option>
            {/* Уроки ведут только педагоги: менеджеру занятие не назначить. */}
            {teachers.filter(isTeacher).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Тема</label>
          <input style={inputStyle} value={form.topic} onChange={set('topic')} placeholder="Необязательно" />
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <label style={labelStyle}>Ученики ({form.studentIds.length})</label>
        <input style={{ ...inputStyle, marginBottom: '8px' }} placeholder="🔍 Найти ученика"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{
          maxHeight: '200px', overflowY: 'auto', background: '#f7f8fa',
          border: '1px solid #e5e7eb', borderRadius: '10px', padding: '6px',
        }}>
          {visible.map(c => (
            <label key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px',
              cursor: 'pointer', fontSize: '13px', color: '#111827',
            }}>
              <input type="checkbox" checked={form.studentIds.includes(c.id)} onChange={() => toggleStudent(c.id)} />
              {c.childName}
            </label>
          ))}
          {visible.length === 0 && <p style={{ fontSize: '13px', color: '#6b7280', padding: '8px' }}>Никого не найдено</p>}
        </div>
      </div>

      {error && (
        <p style={{
          background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
          borderRadius: '10px', padding: '8px 12px', fontSize: '13px', marginTop: '12px',
        }}>⚠️ {error}</p>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
        <button type="submit" disabled={saving} style={{
          background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 16px',
          borderRadius: '10px', fontSize: '13px', fontWeight: '600',
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Сохраняем...' : 'Создать занятие'}</button>
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
          padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
        }}>Отмена</button>
      </div>
    </form>
  )
}
