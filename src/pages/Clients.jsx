import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { toAmount, toCount } from '../lib/amount'
import { withTimeout, describeError } from '../lib/withTimeout'
import ClientForm from '../components/ClientForm'
import ErrorBanner from '../components/ErrorBanner'
import {
  getAge, ageLabel, formatBirthday, contactRows, sourceInfo, genderInfo,
  searchText, clientToForm, instagramUrl, telegramUrl, phoneUrl,
} from '../lib/client'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
  marginBottom: '16px',
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

const chip = (background, color) => ({
  fontSize: '12px', background, color, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
})

const link = { color: '#4b5563', textDecoration: 'none', borderBottom: '1px dotted #9ca3af' }

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

export default function Clients() {
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [legalEntities, setLegalEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showAddClient, setShowAddClient] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [paymentForm, setPaymentForm] = useState({})

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [cs, ps, les] = await withTimeout(Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'legalEntities')),
      ]))
      setClients(cs.docs.map(d => ({ id: d.id, ...d.data() })))
      setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() })))
      setLegalEntities(les.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
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
    const amount = toAmount(f?.amount)
    if (amount === null) {
      alert('Введите корректную сумму — неотрицательное число')
      return
    }
    setSaving(true)
    try {
      await addDoc(collection(db, 'payments'), {
        clientId,
        clientName,
        amount,
        type: f.type, // 'income' | 'session'
        sessions: f.type === 'session' ? (toCount(f.sessions, 1) ?? 1) : 0,
        description: f.description || '',
        date: new Date(),
      })
      closeForm(clientId)
      fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleAddClient = async (data) => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'clients'), { ...data, createdAt: new Date() })
      setShowAddClient(false)
      fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateClient = async (id, data) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'clients', id), data)
      setEditingId(null)
      fetchData()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (id) => {
    setShowAddClient(false)
    setEditingId(id)
  }

  const handleDeleteClient = async (id) => {
    if (!confirm('Удалить клиента и все его платежи?')) return
    if (editingId === id) setEditingId(null)
    await deleteDoc(doc(db, 'clients', id))
    await Promise.all(payments.filter(p => p.clientId === id).map(p => deleteDoc(doc(db, 'payments', p.id))))
    fetchData()
  }

  const handleDeletePayment = async (paymentId) => {
    await deleteDoc(doc(db, 'payments', paymentId))
    fetchData()
  }

  const query = search.trim().toLowerCase()
  const filtered = clients.filter(c => {
    const matchSearch = !query || searchText(c).includes(query)
    const balance = getTotalBalance(c.id)
    if (filterStatus === 'debt') return matchSearch && balance < 0
    if (filterStatus === 'paid') return matchSearch && balance >= 0
    return matchSearch
  })

  const years = [...new Set(payments.map(p => p.date?.seconds ? new Date(p.date.seconds * 1000).getFullYear() : null).filter(Boolean))]
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear())

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>👶 Клиенты</h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>{clients.length} клиентов</p>
        </div>
        <button onClick={() => { setEditingId(null); setShowAddClient(!showAddClient) }} style={btn()}>
          + Добавить клиента
        </button>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {/* Add client form */}
      {showAddClient && (
        <ClientForm
          saving={saving}
          legalEntities={legalEntities}
          onSubmit={handleAddClient}
          onCancel={() => setShowAddClient(false)}
        />
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
        <p style={{ color: '#6b7280', fontSize: '14px' }}>Клиентов нет</p>
      ) : filtered.map(c => {
        const balance = getTotalBalance(c.id)
        const { income, sessions, sessionsCost } = getPeriodStats(c.id)
        const isPaid = balance >= 0
        const pf = paymentForm[c.id] || {}
        const historyPayments = getFilteredPayments(c.id)
        const periodLabel = filterMonth !== 'all' ? `${MONTHS[filterMonth]} ${filterYear}` : 'за всё время'

        if (editingId === c.id) {
          return (
            <ClientForm
              key={c.id}
              initial={clientToForm(c)}
              saving={saving}
              legalEntities={legalEntities}
              onSubmit={data => handleUpdateClient(c.id, data)}
              onCancel={() => setEditingId(null)}
            />
          )
        }

        const age = getAge(c)
        const gender = genderInfo(c)
        const source = sourceInfo(c)
        const birthday = formatBirthday(c.birthDate)
        const contacts = contactRows(c)
        const payer = c.payerType === 'legal'
          ? legalEntities.find(e => e.id === c.legalEntityId)
          : null
        const secondaryBtn = {
          background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
          padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
        }

        return (
          <div key={c.id} style={card}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {gender && <span title={gender.label}>{gender.icon}</span>}
                  <span style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>{c.childName}</span>
                  {age !== null && <span style={{ color: '#6b7280', fontSize: '14px' }}>{ageLabel(age)}</span>}
                  <span style={{
                    fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px',
                    background: isPaid ? '#dcfce7' : '#fee2e2',
                    color: isPaid ? '#059669' : '#dc2626'
                  }}>
                    {isPaid ? '✅ ОПЛАЧЕНО' : '🔴 ДОЛГ'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                  {contacts.map(r => (
                    <div key={r.role} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', fontSize: '13px', color: '#4b5563' }}>
                      <span style={{ color: '#6b7280' }}>{r.icon} {r.role}</span>
                      {r.name && <span style={{ color: '#111827' }}>{r.name}</span>}
                      {r.phones.map((p, i) => <a key={`${p}-${i}`} href={phoneUrl(p)} style={link}>📞 {p}</a>)}
                      {r.instagram && <a href={instagramUrl(r.instagram)} target="_blank" rel="noreferrer" style={link}>📸 @{r.instagram}</a>}
                      {r.telegram && <a href={telegramUrl(r.telegram)} target="_blank" rel="noreferrer" style={link}>✈️ @{r.telegram}</a>}
                      {r.email && <span>✉️ {r.email}</span>}
                    </div>
                  ))}
                  {c.childContacts && (
                    <div style={{ fontSize: '13px', color: '#4b5563' }}>
                      <span style={{ color: '#6b7280' }}>🧒 Ребёнок</span> <span>{c.childContacts}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {birthday && <span style={chip('#f3f4f6', '#4b5563')}>🎂 {birthday}</span>}
                  {source && <span style={chip('#ede9fe', '#5b21b6')}>{source.icon} {source.label}</span>}
                  {Number.isFinite(c.lessonPrice) && (
                    <span style={chip('#dcfce7', '#047857')}>💳 {c.lessonPrice.toLocaleString()} сум / занятие</span>
                  )}
                  {payer && <span style={chip('#f3f4f6', '#4b5563')}>🏛️ Платит {payer.name}</span>}
                  {c.allergies && <span style={chip('#fee2e2', '#b91c1c')}>⚠️ {c.allergies}</span>}
                  {c.notes && <span style={chip('#f3f4f6', '#4b5563')}>📝 {c.notes}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => startEdit(c.id)} style={secondaryBtn}>Изменить</button>
                <button onClick={() => handleDeleteClient(c.id)} style={secondaryBtn}>Удалить</button>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '14px', background: '#f7f8fa', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Баланс</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: balance >= 0 ? '#059669' : '#dc2626' }}>
                  {balance.toLocaleString()} сум
                </div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Оплачено ({periodLabel})</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>{income.toLocaleString()} сум</div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Занятий ({periodLabel})</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#7c3aed' }}>{sessions}</div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Списано ({periodLabel})</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#ea580c' }}>{sessionsCost.toLocaleString()} сум</div>
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
              <div style={{ background: '#f7f8fa', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
                <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: pf.type === 'income' ? '#059669' : '#7c3aed' }}>
                  {pf.type === 'income' ? '💰 Принять оплату' : '🏃 Записать занятие'}
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                      {pf.type === 'income' ? 'Сумма оплаты (сум) *' : 'Стоимость занятия (сум) *'}
                    </label>
                    <input type="number" min="0" placeholder="0" style={{ ...inputStyle, width: '140px' }}
                      value={pf.amount}
                      onChange={e => setPaymentForm(prev => ({ ...prev, [c.id]: { ...prev[c.id], amount: e.target.value } }))} />
                  </div>
                  {pf.type === 'session' && (
                    <div>
                      <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Кол-во занятий</label>
                      <input type="number" min="1" placeholder="1" style={{ ...inputStyle, width: '100px' }}
                        value={pf.sessions}
                        onChange={e => setPaymentForm(prev => ({ ...prev, [c.id]: { ...prev[c.id], sessions: e.target.value } }))} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Комментарий</label>
                    <input placeholder="Необязательно" style={inputStyle}
                      value={pf.description}
                      onChange={e => setPaymentForm(prev => ({ ...prev, [c.id]: { ...prev[c.id], description: e.target.value } }))} />
                  </div>
                  <button onClick={() => handlePayment(c.id, c.childName)} disabled={saving || !pf.amount}
                    style={{ ...btn(pf.type === 'income' ? '#059669' : '#7c3aed'), opacity: (!pf.amount || saving) ? 0.6 : 1 }}>
                    Сохранить
                  </button>
                  <button onClick={() => closeForm(c.id)} style={{
                    background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
                    padding: '8px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer'
                  }}>✕</button>
                </div>
              </div>
            )}

            {/* History */}
            {historyPayments.length > 0 && (
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>История {periodLabel}</p>
                {historyPayments.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: i < historyPayments.length - 1 ? '1px solid #f3f4f6' : 'none'
                  }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>
                        {p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString('ru') : '—'}
                      </span>
                      {p.type === 'income' ? (
                        <span style={{ fontSize: '12px', background: '#dcfce7', color: '#059669', padding: '2px 8px', borderRadius: '20px' }}>
                          💰 Оплата
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '20px' }}>
                          🏃 {p.sessions} зан.
                        </span>
                      )}
                      {p.description && <span style={{ fontSize: '12px', color: '#6b7280' }}>{p.description}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: p.type === 'income' ? '#059669' : '#dc2626' }}>
                        {p.type === 'income' ? '+' : '-'}{(p.amount || 0).toLocaleString()} сум
                      </span>
                      <button onClick={() => handleDeletePayment(p.id)} style={{
                        background: 'transparent', color: '#9ca3af', border: 'none',
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
