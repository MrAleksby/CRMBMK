import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'

const card = {
  background: '#1a1a24',
  border: '1px solid #2a2a35',
  borderRadius: '16px',
  padding: '20px',
}

const inputStyle = {
  background: '#0f0f13',
  border: '1px solid #2a2a35',
  borderRadius: '10px',
  padding: '8px 12px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
}

const CATEGORIES = [
  { value: 'rent',      label: '🏢 Аренда' },
  { value: 'salary',   label: '👥 Зарплата' },
  { value: 'ads',      label: '📣 Реклама' },
  { value: 'supplies', label: '🛒 Инвентарь' },
  { value: 'utils',    label: '⚡ Коммунальные' },
  { value: 'other',    label: '📦 Прочее' },
]

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

const emptyForm = { amount: '', category: 'rent', description: '' }

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [filterCat, setFilterCat] = useState('all')

  const fetchExpenses = async () => {
    try {
      if (auth.currentUser) await auth.currentUser.getIdToken()
      const snap = await getDocs(collection(db, 'expenses'))
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
      setExpenses(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchExpenses() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await addDoc(collection(db, 'expenses'), {
        ...form,
        amount: Number(form.amount),
        date: new Date(),
      })
      setForm(emptyForm)
      setShowForm(false)
      fetchExpenses()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить расход?')) return
    await deleteDoc(doc(db, 'expenses', id))
    fetchExpenses()
  }

  const filtered = expenses.filter(e => {
    const matchCat = filterCat === 'all' || e.category === filterCat
    if (filterMonth === 'all') return matchCat
    if (!e.date?.seconds) return false
    const d = new Date(e.date.seconds * 1000)
    return matchCat && d.getMonth() === parseInt(filterMonth) && d.getFullYear() === filterYear
  })

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0)

  // По категориям
  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: filtered.filter(e => e.category === cat.value).reduce((s, e) => s + (e.amount || 0), 0)
  })).filter(c => c.total > 0)

  const years = [...new Set(expenses.map(e => e.date?.seconds ? new Date(e.date.seconds * 1000).getFullYear() : null).filter(Boolean))]
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear())

  if (loading) return <div style={{ color: '#6b6b80', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>📉 Расходы</h2>
          <p style={{ fontSize: '14px', color: '#6b6b80', marginTop: '4px' }}>Расходы компании</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          background: '#dc2626', color: '#fff', border: 'none',
          padding: '10px 20px', borderRadius: '12px', fontSize: '14px',
          fontWeight: '600', cursor: 'pointer'
        }}>
          + Добавить расход
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: '20px' }}>
          <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Новый расход</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#6b6b80', display: 'block', marginBottom: '4px' }}>Сумма (сум) *</label>
              <input required type="number" min="0" placeholder="0" style={inputStyle}
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#6b6b80', display: 'block', marginBottom: '4px' }}>Категория</label>
              <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#6b6b80', display: 'block', marginBottom: '4px' }}>Описание</label>
              <input placeholder="Необязательно" style={inputStyle}
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="submit" disabled={saving} style={{
              background: '#dc2626', color: '#fff', border: 'none',
              padding: '8px 20px', borderRadius: '10px', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.6 : 1
            }}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{
              background: 'transparent', color: '#6b6b80', border: '1px solid #2a2a35',
              padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer'
            }}>Отмена</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: '160px' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">Все категории</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '140px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="all">Все месяцы</option>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '100px' }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
          {years.sort().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Total + by category */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={card}>
          <p style={{ fontSize: '12px', color: '#6b6b80', marginBottom: '8px' }}>
            Итого расходов {filterMonth !== 'all' ? `(${MONTHS[filterMonth]} ${filterYear})` : ''}
          </p>
          <p style={{ fontSize: '28px', fontWeight: '700', color: '#f87171', margin: 0 }}>
            {total.toLocaleString()} сум
          </p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '12px', color: '#6b6b80', marginBottom: '10px' }}>По категориям</p>
          {byCategory.length === 0 ? (
            <p style={{ color: '#6b6b80', fontSize: '13px' }}>Нет данных</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {byCategory.map(c => (
                <div key={c.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#9ca3af' }}>{c.label}</span>
                  <span style={{ color: '#f87171', fontWeight: '600' }}>{c.total.toLocaleString()} сум</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#6b6b80', fontSize: '14px' }}>Расходов нет</p>
        </div>
      ) : (
        <div style={card}>
          {filtered.map((e, i) => {
            const cat = CATEGORIES.find(c => c.value === e.category)
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i < filtered.length - 1 ? '1px solid #2a2a35' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: '#2a1515', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '16px'
                  }}>
                    {cat?.label.split(' ')[0] || '📦'}
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#fff', margin: 0 }}>
                      {cat?.label.split(' ').slice(1).join(' ') || 'Прочее'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', color: '#6b6b80' }}>
                        {e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString('ru') : '—'}
                      </span>
                      {e.description && <span style={{ fontSize: '12px', color: '#6b6b80' }}>· {e.description}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#f87171' }}>
                    -{(e.amount || 0).toLocaleString()} сум
                  </span>
                  <button onClick={() => handleDelete(e.id)} style={{
                    background: 'transparent', color: '#4b4b60', border: 'none',
                    cursor: 'pointer', fontSize: '16px', padding: '2px 6px'
                  }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
