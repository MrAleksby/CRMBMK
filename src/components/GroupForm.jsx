import { useState } from 'react'
import {
  WEEKDAYS, GROUP_MODES, generateDates, validateGroupForm,
} from '../lib/group'

const inputStyle = {
  background: '#f7f8fa',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '8px 12px',
  color: '#111827',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
}

const labelStyle = { fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }

const sectionTitle = {
  fontSize: '12px', fontWeight: '700', color: '#7c3aed',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
}

const section = {
  background: '#f7f8fa', border: '1px solid #f3f4f6',
  borderRadius: '12px', padding: '14px', marginBottom: '12px',
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }

function Field({ label, children }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>
}

export default function GroupForm({ initial, clients, teachers, saving, scheduleLocked, editing, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [studentSearch, setStudentSearch] = useState('')

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const toggleWeekday = (value) => {
    const weekdays = form.weekdays.includes(value)
      ? form.weekdays.filter(w => w !== value)
      : [...form.weekdays, value]
    setForm({ ...form, weekdays })
  }

  const toggleStudent = (clientId) => {
    const studentIds = form.studentIds.includes(clientId)
      ? form.studentIds.filter(s => s !== clientId)
      : [...form.studentIds, clientId]
    setForm({ ...form, studentIds })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateGroupForm(form)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    onSubmit(form)
  }

  const dates = scheduleLocked ? [] : generateDates(form)
  const rebuilding = editing && !scheduleLocked

  const query = studentSearch.trim().toLowerCase()
  const visibleClients = query
    ? clients.filter(c => String(c.childName || '').toLowerCase().includes(query))
    : clients

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#ffffff', border: '1px solid #e5e7eb',
      borderRadius: '16px', padding: '20px', marginBottom: '16px',
    }}>
      <h3 style={{ color: '#111827', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
        {editing ? 'Изменить группу' : 'Новая группа'}
      </h3>

      <div style={section}>
        <p style={sectionTitle}>📋 Основное</p>
        <div style={grid}>
          <Field label="Название *">
            <input required style={inputStyle} value={form.name} onChange={set('name')}
              placeholder="Группа сб 11" />
          </Field>
          <Field label="Педагог">
            <select style={inputStyle} value={form.teacherId} onChange={set('teacherId')}>
              <option value="">Не выбран</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {scheduleLocked ? (
        <div style={{ ...section, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
            Расписание менять нельзя: в группе есть проведённые занятия, за ними стоят списания.
            Здесь правятся название, педагог и состав — изменения перейдут только
            в <b>запланированные</b> занятия.
          </p>
        </div>
      ) : (
        <div style={section}>
          <p style={sectionTitle}>🗓 Расписание</p>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {GROUP_MODES.map(m => (
              <button key={m.value} type="button" onClick={() => setForm({ ...form, mode: m.value })}
                style={{
                  flex: 1, minWidth: '200px', textAlign: 'left', cursor: 'pointer',
                  background: form.mode === m.value ? '#ede9fe' : '#ffffff',
                  border: `1px solid ${form.mode === m.value ? '#7c3aed' : '#e5e7eb'}`,
                  borderRadius: '10px', padding: '10px 12px',
                }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: form.mode === m.value ? '#5b21b6' : '#111827' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{m.hint}</div>
              </button>
            ))}
          </div>

          {form.mode === 'weekly' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Дни недели</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {WEEKDAYS.map(day => {
                  const active = form.weekdays.includes(day.value)
                  return (
                    <button key={day.value} type="button" onClick={() => toggleWeekday(day.value)}
                      title={day.label}
                      style={{
                        width: '44px', padding: '8px 0', borderRadius: '8px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: '600',
                        background: active ? '#7c3aed' : '#ffffff',
                        color: active ? '#fff' : '#4b5563',
                        border: `1px solid ${active ? '#7c3aed' : '#e5e7eb'}`,
                      }}>{day.short}</button>
                  )
                })}
              </div>
            </div>
          )}

          <div style={grid}>
            <Field label={form.mode === 'range' ? 'Первый день *' : 'Начало периода *'}>
              <input required type="date" style={inputStyle} value={form.dateFrom} onChange={set('dateFrom')} />
            </Field>
            <Field label={form.mode === 'range' ? 'Последний день *' : 'Конец периода *'}>
              <input required type="date" style={inputStyle} value={form.dateTo} onChange={set('dateTo')} />
            </Field>
            <Field label="Время начала">
              <input type="time" style={inputStyle} value={form.timeFrom} onChange={set('timeFrom')} />
            </Field>
            <Field label="Время окончания">
              <input type="time" style={inputStyle} value={form.timeTo} onChange={set('timeTo')} />
            </Field>
          </div>

          {dates.length > 0 && (
            <p style={{ fontSize: '13px', color: '#4b5563', marginTop: '12px' }}>
              {rebuilding ? 'Занятия будут пересозданы' : 'Будет создано занятий'}: <b>{dates.length}</b>
              {' — '}
              с {new Date(dates[0]).toLocaleDateString('ru')} по {new Date(dates[dates.length - 1]).toLocaleDateString('ru')}
            </p>
          )}

          {rebuilding && (
            <p style={{
              fontSize: '12px', color: '#92400e', background: '#fffbeb',
              border: '1px solid #fde68a', borderRadius: '10px', padding: '8px 10px', marginTop: '10px',
            }}>
              Проведённых занятий в группе нет, поэтому расписание можно менять свободно.
              Старые запланированные занятия будут удалены и созданы заново по новым дням.
            </p>
          )}
        </div>
      )}

      <div style={section}>
        <p style={sectionTitle}>👶 Ученики ({form.studentIds.length})</p>
        <input style={{ ...inputStyle, marginBottom: '10px' }} placeholder="🔍 Найти ученика"
          value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />

        {clients.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#6b7280' }}>Сначала заведите клиентов</p>
        ) : (
          <div style={{
            maxHeight: '220px', overflowY: 'auto', background: '#ffffff',
            border: '1px solid #e5e7eb', borderRadius: '10px', padding: '6px',
          }}>
            {visibleClients.map(c => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px',
                borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#111827',
              }}>
                <input type="checkbox" checked={form.studentIds.includes(c.id)}
                  onChange={() => toggleStudent(c.id)} />
                {c.childName}
              </label>
            ))}
            {visibleClients.length === 0 && (
              <p style={{ fontSize: '13px', color: '#6b7280', padding: '8px' }}>Никого не найдено</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p style={{
          background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
          borderRadius: '10px', padding: '8px 12px', fontSize: '13px', marginBottom: '12px',
        }}>⚠️ {error}</p>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit" disabled={saving} style={{
          background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 16px',
          borderRadius: '10px', fontSize: '13px', fontWeight: '600',
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Сохраняем...' : 'Сохранить'}</button>
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
          padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
        }}>Отмена</button>
      </div>
    </form>
  )
}
