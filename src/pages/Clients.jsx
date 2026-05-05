import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'

const card = {
  background: '#1a1a24',
  border: '1px solid #2a2a35',
  borderRadius: '16px',
  padding: '20px',
  marginBottom: '16px',
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

const btn = (color = '#7c3aed') => ({
  background: color,
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
})

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

export default function Clients() {
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddClient, setShowAddClient] = useState(false)
  const [clientForm, setClientForm] = useState({ childName: '', childAge: '', parentName: '', phone: '', email: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [paymentForm, setPaymentForm] = useState({})

  const fetchData = async () => {
    try {
      if (auth.currentUser) await auth.currentUser.getIdToken()
      const [cs, ps] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'payments')),
      ])
      setClients(cs.docs.map(d => ({ id: d.id, ...d.data() })))
      setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Все платежи клиента (для баланса — всегда полные)
  const getAllClientPayments = (clientId) =>
    payments.filter(p => p.clientId === clientId).sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))

  // Платежи с фильтром по месяцу/году
  const getFilteredPayments = (clientId) => {
    return getAllClientPayments(clientId).filter(p => {
      if (filterMonth === 'all') return true
      if (!p.date?.seconds) return false
      const d = new Date(p.date.seconds * 1000)
      return d.getMonth() === parseInt(filterMonth) && d.getFullYear() === filterYear
    })
  }

  // Баланс считается всегда по всем платежам
  const getTotalBalance = (clientId) => {
    const ps = getAllClientPayments(clientId)
    const income = ps.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
    const sessions = ps.filter(p => p.type === 'session').reduce((s, p) => s + (p.amount || 0), 0)
    return income - sessions
  }

  // Статистика по выбранному периоду
  const getPeriodStats = (clientId) => {
    const ps = getFilteredPayments(clientId)
    const income = ps.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
    const sessions = ps.filter(p => p.type === 'session').reduce((s, p) => s + (p.sessions || 0), 0)
    const sessionsCost = ps.filter(p => p.type === 'session').reduce((s, p) => s + (p.amount || 0), 0)
    return { income, sessions, sessionsCost }
  }

  const openForm = (clientId, type) => {
    setPaymentForm(prev => ({
      ...prev,
      [clientId]: { open: true, type, amount: '', sessions: '', description: '' }
    }))
  }

  const closeForm = (clientId) => {
    setPaymentForm(prev => ({ ...prev, [clientId]: { open: false } }))
  }

  const handlePayment = async (clientId, clientName) => {
    const f = paymentForm[clientId]
    if (!f?.amount) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'payments'), {
        clientId,
        clientName,
        amount: Number(f.amount),
        type: f.type, // 'income' | 'session'
        sessions: f.type === 'session' ? (Number(f.sessions) || 1) : 0,
        description: f.description || '',
        date: new Date(),
      })
      closeForm(clientId)
      fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleAddClient = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await addDoc(collection(db, 'clients'), {
        ...clientForm,
        childAge: Number(clientForm.childAge),
        createdAt: new Date(),
      })
      setClientForm({ childName: '', childAge: '', parentName: '', phone: '', email: '', notes: '' })
      setShowAddClient(false)
      fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClient = async (id) => {
    if (!confirm('Удалить клиента и все его платежи?')) return
    await deleteDoc(doc(db, 'clients', id))
    await Promise.all(payments.filter(p => p.clientId === id).map(p => deleteDoc(doc(db, 'payments', p.id))))
    fetchData()
  }

  const handleDeletePayment = async (paymentId) => {
    await deleteDoc(doc(db, 'payments', paymentId))
    fetchData()
  }

  const filtered = clients.filter(c => {
    const matchSearch = `${c.childName} ${c.parentName} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
    const balance = getTotalBalance(c.id)
    if (filterStatus === 'debt') return matchSearch && balance < 0
    if (filterStatus === 'paid') return matchSearch && balance >= 0
    return matchSearch
  })

  const years = [...new Set(payments.map(p => p.date?.seconds ? new Date(p.date.seconds * 1000).getFullYear() : null).filter(Boolean))]
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear())

  if (loading) return <div style={{ color: '#6b6b80', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>👶 Клиенты</h2>
          <p style={{ fontSize: '14px', color: '#6b6b80', marginTop: '4px' }}>{clients.length} клиентов</p>
        </div>
        <button onClick={() => setShowAddClient(!showAddClient)} style={btn()}>+ Добавить клиента</button>
      </div>

      {/* Add client form */}
      {showAddClient && (
        <form onSubmit={handleAddClient} style={{ ...card, marginBottom: '20px' }}>
          <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Новый клиент</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Имя ребёнка *', key: 'childName', required: true },
              { label: 'Возраст', key: 'childAge', type: 'number' },
              { label: 'Имя родителя *', key: 'parentName', required: true },
              { label: 'Телефон', key: 'phone' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Заметки', key: 'notes' },
            ].map(({ label, key, type = 'text', required }) => (
              <div key={key}>
                <label style={{ fontSize: '12px', color: '#6b6b80', display: 'block', marginBottom: '4px' }}>{label}</label>
                <input required={required} type={type} style={inputStyle}
                  value={clientForm[key]} onChange={e => setClientForm({ ...clientForm, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="submit" disabled={saving} style={{ ...btn(), opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
            <button type="button" onClick={() => setShowAddClient(false)} style={{
              background: 'transparent', color: '#6b6b80', border: '1px solid #2a2a35',
              padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer'
            }}>Отмена</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input placeholder="🔍 Поиск..." style={{ ...inputStyle, width: '200px' }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inputStyle, width: '160px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Все клиенты</option>
          <option value="paid">✅ Есть баланс</option>
          <option value="debt">🔴 Долг</option>
        </select>
        <select style={{ ...inputStyle, width: '130px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="all">Все месяцы</option>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '100px' }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
          {years.sort().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Clients */}
      {filtered.length === 0 ? (
        <p style={{ color: '#6b6b80', fontSize: '14px' }}>Клиентов нет</p>
      ) : filtered.map(c => {
        const balance = getTotalBalance(c.id)
        const { income, sessions, sessionsCost } = getPeriodStats(c.id)
        const isPaid = balance >= 0
        const pf = paymentForm[c.id] || {}
        const historyPayments = getFilteredPayments(c.id)
        const periodLabel = filterMonth !== 'all' ? `${MONTHS[filterMonth]} ${filterYear}` : 'за всё время'

        return (
          <div key={c.id} style={card}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>{c.childName}</span>
                  {c.childAge && <span style={{ color: '#6b6b80', fontSize: '14px' }}>{c.childAge} лет</span>}
                  <span style={{
                    fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px',
                    background: isPaid ? '#14532d' : '#450a0a',
                    color: isPaid ? '#34d399' : '#f87171'
                  }}>
                    {isPaid ? '✅ ОПЛАЧЕНО' : '🔴 ДОЛГ'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#9ca3af' }}>
                  {c.parentName && <span>👩 {c.parentName}</span>}
                  {c.phone && <span>📞 {c.phone}</span>}
                  {c.notes && <span>📝 {c.notes}</span>}
                </div>
              </div>
              <button onClick={() => handleDeleteClient(c.id)} style={{
                background: 'transparent', color: '#6b6b80', border: '1px solid #2a2a35',
                padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
              }}>Удалить</button>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '14px', background: '#0f0f13', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #2a2a35' }}>
                <div style={{ fontSize: '11px', color: '#6b6b80', marginBottom: '4px' }}>Баланс</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: balance >= 0 ? '#34d399' : '#f87171' }}>
                  {balance.toLocaleString()} сум
                </div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #2a2a35' }}>
                <div style={{ fontSize: '11px', color: '#6b6b80', marginBottom: '4px' }}>Оплачено ({periodLabel})</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#34d399' }}>{income.toLocaleString()} сум</div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #2a2a35' }}>
                <div style={{ fontSize: '11px', color: '#6b6b80', marginBottom: '4px' }}>Занятий ({periodLabel})</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#a78bfa' }}>{sessions}</div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#6b6b80', marginBottom: '4px' }}>Списано ({periodLabel})</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#fb923c' }}>{sessionsCost.toLocaleString()} сум</div>
              </div>
            </div>

            {/* Action buttons */}
            {!pf.open && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <button onClick={() => openForm(c.id, 'income')} style={btn('#059669')}>
                  💰 Принять оплату
                </button>
                <button onClick={() => openForm(c.id, 'session')} style={btn('#7c3aed')}>
                  🏃 Записать занятие
                </button>
              </div>
            )}

            {/* Inline form */}
            {pf.open && (
              <div style={{ background: '#0f0f13', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
                <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: pf.type === 'income' ? '#34d399' : '#a78bfa' }}>
                  {pf.type === 'income' ? '💰 Принять оплату' : '🏃 Записать занятие'}
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#6b6b80', display: 'block', marginBottom: '4px' }}>
                      {pf.type === 'income' ? 'Сумма оплаты (сум) *' : 'Стоимость занятия (сум) *'}
                    </label>
                    <input type="number" min="0" placeholder="0" style={{ ...inputStyle, width: '140px' }}
                      value={pf.amount}
                      onChange={e => setPaymentForm(prev => ({ ...prev, [c.id]: { ...prev[c.id], amount: e.target.value } }))} />
                  </div>
                  {pf.type === 'session' && (
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b6b80', display: 'block', marginBottom: '4px' }}>Кол-во занятий</label>
                      <input type="number" min="1" placeholder="1" style={{ ...inputStyle, width: '100px' }}
                        value={pf.sessions}
                        onChange={e => setPaymentForm(prev => ({ ...prev, [c.id]: { ...prev[c.id], sessions: e.target.value } }))} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: '#6b6b80', display: 'block', marginBottom: '4px' }}>Комментарий</label>
                    <input placeholder="Необязательно" style={inputStyle}
                      value={pf.description}
                      onChange={e => setPaymentForm(prev => ({ ...prev, [c.id]: { ...prev[c.id], description: e.target.value } }))} />
                  </div>
                  <button onClick={() => handlePayment(c.id, c.childName)} disabled={saving || !pf.amount}
                    style={{ ...btn(pf.type === 'income' ? '#059669' : '#7c3aed'), opacity: (!pf.amount || saving) ? 0.6 : 1 }}>
                    Сохранить
                  </button>
                  <button onClick={() => closeForm(c.id)} style={{
                    background: 'transparent', color: '#6b6b80', border: '1px solid #2a2a35',
                    padding: '8px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer'
                  }}>✕</button>
                </div>
              </div>
            )}

            {/* History */}
            {historyPayments.length > 0 && (
              <div style={{ borderTop: '1px solid #2a2a35', paddingTop: '12px' }}>
                <p style={{ fontSize: '12px', color: '#6b6b80', marginBottom: '8px' }}>История {periodLabel}</p>
                {historyPayments.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: i < historyPayments.length - 1 ? '1px solid #1f1f2e' : 'none'
                  }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#6b6b80' }}>
                        {p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString('ru') : '—'}
                      </span>
                      {p.type === 'income' ? (
                        <span style={{ fontSize: '12px', background: '#14532d', color: '#34d399', padding: '2px 8px', borderRadius: '20px' }}>
                          💰 Оплата
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', background: '#2a2a3e', color: '#a78bfa', padding: '2px 8px', borderRadius: '20px' }}>
                          🏃 {p.sessions} зан.
                        </span>
                      )}
                      {p.description && <span style={{ fontSize: '12px', color: '#6b6b80' }}>{p.description}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: p.type === 'income' ? '#34d399' : '#f87171' }}>
                        {p.type === 'income' ? '+' : '-'}{p.amount.toLocaleString()} сум
                      </span>
                      <button onClick={() => handleDeletePayment(p.id)} style={{
                        background: 'transparent', color: '#4b4b60', border: 'none',
                        cursor: 'pointer', fontSize: '14px', padding: '2px 6px'
                      }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
