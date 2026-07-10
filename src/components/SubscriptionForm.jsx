import { useState } from 'react'
import { perLessonPrice } from '../lib/directories'
import {
  emptySubscriptionForm, validateSubscriptionForm,
  endDateFromWeeks, weeksBetween,
} from '../lib/subscription'

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 8px', color: '#111827', fontSize: '13px', outline: 'none', width: '100%',
}

const labelStyle = { fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }

export default function SubscriptionForm({ initial, packages, saving, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || emptySubscriptionForm)
  const [error, setError] = useState('')
  const editing = Boolean(initial)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  // Срок в неделях и дата окончания — одно и то же, записанное по-разному.
  // Правишь одно — второе пересчитывается, как в AlfaCRM.
  const setWeeks = (e) => {
    const weeks = e.target.value
    setForm({ ...form, weeks, endDate: endDateFromWeeks(form.startDate, weeks) })
  }
  const setEndDate = (e) => {
    const endDate = e.target.value
    setForm({ ...form, endDate, weeks: String(weeksBetween(form.startDate, endDate) || '') })
  }
  const setStartDate = (e) => {
    const startDate = e.target.value
    setForm({ ...form, startDate, endDate: endDateFromWeeks(startDate, form.weeks) || form.endDate })
  }

  // Архивный тариф остаётся в списке, если этот абонемент уже на нём выдан:
  // иначе при правке сроков молча слетел бы пакет.
  const chosen = packages.find(p => p.id === form.packageId)
  const options = packages.filter(p => p.active !== false || p.id === form.packageId)
  const price = chosen ? perLessonPrice(chosen) : null

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateSubscriptionForm(form, packages)
    if (problem) return setError(problem)
    setError('')
    onSubmit(form, chosen)
  }

  if (options.length === 0) {
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
          {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
          <input required type="date" style={inputStyle} value={form.startDate} onChange={setStartDate} />
        </div>
        <div>
          <label style={labelStyle}>Недель</label>
          <input type="number" min="1" style={inputStyle} value={form.weeks}
            onChange={setWeeks} placeholder="8" />
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={labelStyle}>Действует по</label>
        <input type="date" style={inputStyle} value={form.endDate} onChange={setEndDate} />
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={labelStyle}>Комментарий</label>
        <input style={inputStyle} value={form.note} onChange={set('note')}
          placeholder="Любое текстовое примечание" />
      </div>

      {error && (
        <p style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}>⚠️ {error}</p>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="submit" disabled={saving} style={{
          background: '#7c3aed', color: '#fff', border: 'none', padding: '6px 12px',
          borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Сохраняем...' : editing ? 'Сохранить' : 'Выдать'}
        </button>
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
        }}>Отмена</button>
      </div>
    </form>
  )
}
