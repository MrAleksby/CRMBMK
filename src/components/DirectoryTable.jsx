import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { toAmount, toCount } from '../lib/amount'
import { normalizeHandle } from '../lib/client'
import { withTimeout, describeError } from '../lib/withTimeout'
import {
  FIELD_AMOUNT, FIELD_COUNT, FIELD_SELECT, FIELD_HANDLE,
  emptyItem, optionLabel, perLessonPrice, sortItems, nextOrder,
} from '../lib/directories'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
}

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

const btn = (background = '#7c3aed') => ({
  background, color: '#fff', border: 'none', padding: '8px 16px',
  borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

const ghostBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
}

// Приводит значение поля из формы к тому, что уходит в Firestore.
// Возвращает { value } либо { error }.
function parseField(field, raw) {
  const str = typeof raw === 'string' ? raw.trim() : raw

  if (field.required && (str === '' || str == null)) {
    return { error: `Заполните поле «${field.label}»` }
  }

  if (field.type === FIELD_AMOUNT) {
    if (str === '') return { value: null }
    const amount = toAmount(str)
    if (amount === null) return { error: `«${field.label}»: введите неотрицательное число` }
    return { value: amount }
  }

  if (field.type === FIELD_COUNT) {
    if (str === '') return { value: null }
    const count = toCount(str, field.min ?? 0)
    if (count === null) return { error: `«${field.label}»: введите целое число` }
    return { value: count }
  }

  if (field.type === FIELD_HANDLE) return { value: normalizeHandle(str) }

  return { value: str }
}

function formatCell(dir, item, key) {
  if (key === 'perLesson') {
    const price = perLessonPrice(item)
    return price === null ? '—' : `${price.toLocaleString()} сум / урок`
  }
  const field = dir.fields.find(f => f.key === key)
  const value = item[key]
  if (value === '' || value == null) return '—'
  if (field?.type === FIELD_SELECT) return optionLabel(field, value)
  if (field?.type === FIELD_AMOUNT) return `${Number(value).toLocaleString()} сум`
  if (field?.type === FIELD_HANDLE) return `@${value}`
  return String(value)
}

export default function DirectoryTable({ dir }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(() => emptyItem(dir))
  const [error, setError] = useState('')

  const fetchItems = async () => {
    setLoading(true)
    setError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const snap = await withTimeout(getDocs(collection(db, dir.key)))
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setItems(sortItems(dir, data))
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  // Смена справочника — сбрасываем состояние формы вместе с данными.
  useEffect(() => {
    setEditingId(null)
    setShowForm(false)
    setForm(emptyItem(dir))
    setError('')
    fetchItems()
  }, [dir.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const buildDoc = () => {
    const result = {}
    for (const field of dir.fields) {
      const { value, error: fieldError } = parseField(field, form[field.key])
      if (fieldError) return { error: fieldError }
      result[field.key] = value
    }
    return { doc: result }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const { doc: data, error: validationError } = buildDoc()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setSaving(true)
    try {
      if (editingId) {
        await updateDoc(doc(db, dir.key, editingId), data)
      } else {
        const extra = dir.sortBy ? { order: nextOrder(items, data.kind) } : {}
        await addDoc(collection(db, dir.key), { ...data, ...extra, active: true, createdAt: new Date() })
      }
      closeForm()
      await fetchItems()
    } catch (err) {
      console.error(err)
      setError('Не удалось сохранить. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!confirm(`Удалить «${item.name}»?`)) return
    try {
      await deleteDoc(doc(db, dir.key, item.id))
      await fetchItems()
    } catch (err) {
      console.error(err)
      setError('Не удалось удалить.')
    }
  }

  const toggleActive = async (item) => {
    try {
      await updateDoc(doc(db, dir.key, item.id), { active: item.active === false })
      await fetchItems()
    } catch (err) {
      console.error(err)
      setError('Не удалось изменить статус.')
    }
  }

  // Добавляет только те типовые записи, которых ещё нет — повторный вызов не плодит дубли.
  const missingSeed = dir.seed
    ? dir.seed.filter(row => !items.some(i => String(i.name).trim().toLowerCase() === row.name.toLowerCase()))
    : []

  const handleSeed = async () => {
    setSaving(true)
    try {
      for (const row of missingSeed) {
        await addDoc(collection(db, dir.key), { ...row, active: true, createdAt: new Date() })
      }
      await fetchItems()
    } catch (err) {
      console.error(err)
      setError('Не удалось создать типовые значения.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item) => {
    const next = emptyItem(dir)
    for (const field of dir.fields) {
      const value = item[field.key]
      next[field.key] = value == null ? '' : String(value)
    }
    setForm(next)
    setEditingId(item.id)
    setShowForm(true)
    setError('')
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyItem(dir))
  }

  const openCreate = () => {
    setForm(emptyItem(dir))
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  const columns = dir.columns ?? dir.fields.map(f => f.key)
  const columnLabel = (key) =>
    key === 'perLesson' ? 'Цена урока' : dir.fields.find(f => f.key === key)?.label ?? key

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 }}>
            {dir.icon} {dir.label}
          </h3>
          {dir.hint && <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px', maxWidth: '520px' }}>{dir.hint}</p>}
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {missingSeed.length > 0 && items.length > 0 && (
              <button onClick={handleSeed} disabled={saving} style={{ ...btn('#059669'), opacity: saving ? 0.6 : 1 }}>
                + Типовые ({missingSeed.length})
              </button>
            )}
            <button onClick={openCreate} style={btn()}>+ Добавить</button>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
          borderRadius: '10px', padding: '10px 12px', fontSize: '13px', marginBottom: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span>⚠️ {error}</span>
          <button onClick={fetchItems} style={{
            ...ghostBtn, borderColor: '#fecaca', color: '#b91c1c', flexShrink: 0,
          }}>Повторить</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: '16px' }}>
          <h4 style={{ color: '#111827', fontSize: '15px', fontWeight: '600', marginBottom: '14px' }}>
            {editingId ? 'Изменить' : `Добавить ${dir.itemName}`}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            {dir.fields.map(field => (
              <div key={field.key}>
                <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  {field.label}{field.required && ' *'}
                </label>
                {field.type === FIELD_SELECT ? (
                  <select style={inputStyle} value={form[field.key]}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}>
                    {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    style={inputStyle}
                    type={field.type === FIELD_AMOUNT || field.type === FIELD_COUNT ? 'number' : 'text'}
                    min={field.type === FIELD_AMOUNT ? 0 : field.min ?? 0}
                    placeholder={field.placeholder || ''}
                    value={form[field.key]}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="submit" disabled={saving} style={{ ...btn(), opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
            <button type="button" onClick={closeForm} style={{
              background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
              padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
            }}>Отмена</button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: '14px' }}>Загрузка...</p>
      ) : items.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '32px' }}>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: dir.seed ? '14px' : 0 }}>
            Пока пусто
          </p>
          {missingSeed.length > 0 && (
            <button onClick={handleSeed} disabled={saving} style={{ ...btn('#059669'), opacity: saving ? 0.6 : 1 }}>
              Создать типовые значения ({missingSeed.length})
            </button>
          )}
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '520px' }}>
            <thead>
              <tr>
                {columns.map(key => (
                  <th key={key} style={{
                    textAlign: 'left', padding: '14px 16px', color: '#6b7280',
                    fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #e5e7eb',
                  }}>{columnLabel(key)}</th>
                ))}
                <th style={{ borderBottom: '1px solid #e5e7eb' }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const inactive = item.active === false
                return (
                  <tr key={item.id} style={{ opacity: inactive ? 0.45 : 1 }}>
                    {columns.map(key => (
                      <td key={key} style={{
                        padding: '12px 16px', color: key === 'name' ? '#111827' : '#4b5563',
                        fontWeight: key === 'name' ? '600' : '400',
                        borderBottom: i < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                        whiteSpace: 'nowrap',
                      }}>
                        {formatCell(dir, item, key)}
                        {key === 'name' && inactive && (
                          <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6b7280' }}>не активен</span>
                        )}
                      </td>
                    ))}
                    <td style={{
                      padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap',
                      borderBottom: i < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button onClick={() => toggleActive(item)} style={ghostBtn}>
                          {inactive ? 'Включить' : 'Отключить'}
                        </button>
                        <button onClick={() => startEdit(item)} style={ghostBtn}>Изменить</button>
                        <button onClick={() => handleDelete(item)} style={ghostBtn}>Удалить</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
