import { useState } from 'react'
import { GENDERS } from '../lib/client'
import { isTeacher } from '../lib/directories'
import {
  SOURCES, LEAD_STAGES, MAX_PHONES,
  emptyLeadForm, leadFormToDoc, validateLeadForm,
} from '../lib/lead'

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

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }

const iconBtn = {
  background: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280',
  borderRadius: '8px', width: '32px', flexShrink: 0, cursor: 'pointer', fontSize: '14px',
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function PhoneList({ phones, onChange }) {
  const update = (i, v) => onChange(phones.map((p, idx) => (idx === i ? v : p)))
  const remove = (i) => onChange(phones.filter((_, idx) => idx !== i))

  return (
    <div>
      <label style={labelStyle}>Телефоны</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {phones.map((phone, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px' }}>
            <input type="tel" style={inputStyle} value={phone} placeholder="+998 90 123-45-67"
              onChange={e => update(i, e.target.value)} />
            {phones.length > 1 && (
              <button type="button" style={iconBtn} onClick={() => remove(i)} title="Удалить номер">✕</button>
            )}
          </div>
        ))}
      </div>
      {phones.length < MAX_PHONES && (
        <button type="button" onClick={() => onChange([...phones, ''])} style={{
          background: 'transparent', border: 'none', color: '#7c3aed',
          fontSize: '12px', cursor: 'pointer', padding: '6px 0 0',
        }}>+ ещё телефон</button>
      )}
    </div>
  )
}

export default function LeadForm({ initial, saving, staff = [], onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || emptyLeadForm())
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const today = new Date().toISOString().slice(0, 10)

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateLeadForm(form)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    onSubmit(leadFormToDoc(form))
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#ffffff', border: '1px solid #e5e7eb',
      borderRadius: '16px', padding: '20px', marginBottom: '16px',
    }}>
      <h3 style={{ color: '#111827', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
        {initial ? 'Редактирование лида' : 'Новый лид'}
      </h3>

      <div style={section}>
        <p style={sectionTitle}>🧒 Ребёнок</p>
        <div style={grid}>
          <Field label="ФИО ребёнка *">
            <input required style={inputStyle} value={form.childName} onChange={set('childName')}
              placeholder="Фамилия Имя" />
          </Field>
          <Field label="Дата рождения">
            <input type="date" max={today} style={inputStyle} value={form.birthDate} onChange={set('birthDate')} />
          </Field>
          <Field label="Пол">
            <select style={inputStyle} value={form.gender} onChange={set('gender')}>
              <option value="">Не указан</option>
              {GENDERS.map(g => <option key={g.value} value={g.value}>{g.icon} {g.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div style={section}>
        <p style={sectionTitle}>👩 Кто обратился</p>
        <div style={grid}>
          <Field label="ФИО">
            <input style={inputStyle} value={form.parentName} onChange={set('parentName')}
              placeholder="Мама Алихана" />
          </Field>
          <PhoneList phones={form.phones} onChange={phones => setForm({ ...form, phones })} />
          <Field label="Telegram">
            <input style={inputStyle} value={form.telegram} onChange={set('telegram')} placeholder="@nickname" />
          </Field>
          <Field label="Instagram">
            <input style={inputStyle} value={form.instagram} onChange={set('instagram')} placeholder="@nickname" />
          </Field>
        </div>
      </div>

      <div style={section}>
        <p style={sectionTitle}>📊 Воронка</p>
        <div style={grid}>
          <Field label="Этап">
            <select style={inputStyle} value={form.stage} onChange={set('stage')}>
              {LEAD_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Источник">
            <select style={inputStyle} value={form.source} onChange={set('source')}>
              <option value="">Не указан</option>
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
            </select>
          </Field>
          {form.source === 'other' && (
            <Field label="Уточните источник">
              <input style={inputStyle} value={form.sourceNote} onChange={set('sourceNote')}
                placeholder="Например: сарафанное радио" />
            </Field>
          )}
          <Field label="Ответственный">
            <select style={inputStyle} value={form.responsibleId} onChange={set('responsibleId')}>
              <option value="">Не назначен</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{isTeacher(s) ? '🎓' : '💼'} {s.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ marginTop: '12px' }}>
          <Field label="Примечание">
            <textarea style={{ ...inputStyle, minHeight: '64px', resize: 'vertical', fontFamily: 'inherit' }}
              value={form.note} onChange={set('note')}
              placeholder="О чём договорились, когда перезвонить" />
          </Field>
        </div>
      </div>

      {error && (
        <p style={{
          background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
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
