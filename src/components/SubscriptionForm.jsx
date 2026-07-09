import { useState } from 'react'
import { perLessonPrice } from '../lib/directories'
import { emptySubscriptionForm, validateSubscriptionForm } from '../lib/subscription'

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 8px', color: '#111827', fontSize: '13px', outline: 'none', width: '100%',
}

const labelStyle = { fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }

export default function SubscriptionForm({ packages, saving, onSubmit, onCancel }) {
  const [form, setForm] = useState(emptySubscriptionForm)
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const active = packages.filter(p => p.active !== false)
  const chosen = packages.find(p => p.id === form.packageId)
  const price = chosen ? perLessonPrice(chosen) : null

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateSubscriptionForm(form, packages)
    if (problem) return setError(problem)
    setError('')
    onSubmit(form, chosen)
  }

  if (active.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: '#6b7280' }}>
        Сначала заведите абонементы в Настройках.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#f7f8fa', border: '1px solid #e5e7eb',
      borderRadius: '10px', padding: '10px', marginTop: '8px',
    }}>
      <div style={{ marginBottom: '8px' }}>
        <label style={labelStyle}>Абонемент</label>
        <select required style={inputStyle} value={form.packageId} onChange={set('packageId')}>
          <option value="">Выберите…</option>
          {active.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {chosen && (
        <p style={{ fontSize: '11px', color: '#4b5563', marginBottom: '8px' }}>
          {chosen.lessonsCount} уроков · {Number(chosen.price).toLocaleString()} сум
          {price !== null && <> · <b>{price.toLocaleString()} сум за урок</b></>}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <div>
          <label style={labelStyle}>Начало</label>
          <input required type="date" style={inputStyle} value={form.startDate} onChange={set('startDate')} />
        </div>
        <div>
          <label style={labelStyle}>Действует до</label>
          <input type="date" style={inputStyle} value={form.endDate} onChange={set('endDate')} />
        </div>
      </div>

      {error && (
        <p style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}>⚠️ {error}</p>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="submit" disabled={saving} style={{
          background: '#7c3aed', color: '#fff', border: 'none', padding: '6px 12px',
          borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Выдаём...' : 'Выдать'}</button>
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
        }}>Отмена</button>
      </div>
    </form>
  )
}
