import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { toAmount, toCount } from '../lib/amount'
import { withTimeout, describeError } from '../lib/withTimeout'
import ClientForm from '../components/ClientForm'
import ErrorBanner from '../components/ErrorBanner'
import {
  getAge, ageLabel, formatBirthday, contactRows, sourceInfo, genderInfo, statusInfo,
  clientToForm, instagramUrl, telegramUrl, phoneUrl,
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

const secondaryBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '5px 10px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
}

const chip = (background, color) => ({
  fontSize: '12px', background, color, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
})

const link = { color: '#4b5563', textDecoration: 'none', borderBottom: '1px dotted #9ca3af' }

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

export default function ClientCard() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [client, setClient] = useState(null)
  const [payments, setPayments] = useState([])
  const [legalEntities, setLegalEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState({ open: false })

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [snap, ps, les] = await withTimeout(Promise.all([
        getDoc(doc(db, 'clients', id)),
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'legalEntities')),
      ]))
      setClient(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.clientId === id))
      setLegalEntities(les.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = [...payments].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))

  const inPeriod = (p) => {
    if (filterMonth === 'all') return true
    if (!p.date?.seconds) return false
    const d = new Date(p.date.seconds * 1000)
    return d.getMonth() === parseInt(filterMonth) && d.getFullYear() === filterYear
  }

  const sum = (list, type, field = 'amount') =>
    list.filter(p => p.type === type).reduce((s, p) => s + (p[field] || 0), 0)

  const balance = sum(sorted, 'income') - sum(sorted, 'session')
  const periodPayments = sorted.filter(inPeriod)
  const income = sum(periodPayments, 'income')
  const sessions = sum(periodPayments, 'session', 'sessions')
  const sessionsCost = sum(periodPayments, 'session')

  const handlePayment = async () => {
    const amount = toAmount(form.amount)
    if (amount === null) {
      alert('Введите корректную сумму — неотрицательное число')
      return
    }
    setSaving(true)
    try {
      await addDoc(collection(db, 'payments'), {
        clientId: id,
        clientName: client.childName,
        amount,
        type: form.type,
        sessions: form.type === 'session' ? (toCount(form.sessions, 1) ?? 1) : 0,
        description: form.description || '',
        date: new Date(),
      })
      setForm({ open: false })
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (data) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'clients', id), data)
      setEditing(false)
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!confirm('Удалить клиента и все его платежи?')) return
    await deleteDoc(doc(db, 'clients', id))
    await Promise.all(payments.map(p => deleteDoc(doc(db, 'payments', p.id))))
    navigate('/clients')
  }

  const handleDeletePayment = async (paymentId) => {
    await deleteDoc(doc(db, 'payments', paymentId))
    await fetchData()
  }

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  if (!client) {
    return (
      <div style={{ maxWidth: '900px' }}>
        <ErrorBanner message={loadError} onRetry={fetchData} />
        <p style={{ color: '#6b7280' }}>Клиент не найден.</p>
        <Link to="/clients" style={{ color: '#7c3aed' }}>← К списку клиентов</Link>
      </div>
    )
  }

  const age = getAge(client)
  const gender = genderInfo(client)
  const source = sourceInfo(client)
  const status = statusInfo(client)
  const birthday = formatBirthday(client.birthDate)
  const contacts = contactRows(client)
  const payer = client.payerType === 'legal'
    ? legalEntities.find(e => e.id === client.legalEntityId)
    : null
  const isPaid = balance >= 0
  const periodLabel = filterMonth !== 'all' ? `${MONTHS[filterMonth]} ${filterYear}` : 'за всё время'

  const years = [...new Set(sorted.map(p => p.date?.seconds
    ? new Date(p.date.seconds * 1000).getFullYear() : null).filter(Boolean))]
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear())

  if (editing) {
    return (
      <div style={{ maxWidth: '900px' }}>
        <Link to="/clients" style={{ color: '#7c3aed', fontSize: '13px', textDecoration: 'none' }}>← К списку</Link>
        <div style={{ height: '14px' }} />
        <ClientForm
          initial={clientToForm(client)}
          saving={saving}
          legalEntities={legalEntities}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <Link to="/clients" style={{ color: '#7c3aed', fontSize: '13px', textDecoration: 'none' }}>← К списку клиентов</Link>
      <div style={{ height: '14px' }} />

      <ErrorBanner message={loadError} onRetry={fetchData} />

      <div style={card}>
        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {gender && <span title={gender.label}>{gender.icon}</span>}
              <span style={{ fontSize: '22px', fontWeight: '700', color: '#111827' }}>{client.childName}</span>
              {age !== null && <span style={{ color: '#6b7280', fontSize: '14px' }}>{ageLabel(age)}</span>}
              <span style={chip(status.background, status.color)}>{status.label}</span>
              <span style={{
                fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px',
                background: isPaid ? '#dcfce7' : '#fee2e2',
                color: isPaid ? '#059669' : '#dc2626',
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
              {client.childContacts && (
                <div style={{ fontSize: '13px', color: '#4b5563' }}>
                  <span style={{ color: '#6b7280' }}>🧒 Ребёнок</span> <span>{client.childContacts}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {birthday && <span style={chip('#f3f4f6', '#4b5563')}>🎂 {birthday}</span>}
              {source && <span style={chip('#ede9fe', '#5b21b6')}>{source.icon} {source.label}</span>}
              {Number.isFinite(client.lessonPrice) && (
                <span style={chip('#dcfce7', '#047857')}>💳 {client.lessonPrice.toLocaleString()} сум / занятие</span>
              )}
              {payer && <span style={chip('#f3f4f6', '#4b5563')}>🏛️ Платит {payer.name}</span>}
              {client.allergies && <span style={chip('#fee2e2', '#b91c1c')}>⚠️ {client.allergies}</span>}
              {client.notes && <span style={chip('#f3f4f6', '#4b5563')}>📝 {client.notes}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={() => setEditing(true)} style={secondaryBtn}>Изменить</button>
            <button onClick={handleDeleteClient} style={secondaryBtn}>Удалить</button>
          </div>
        </div>

        {/* Период */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          <select style={{ ...inputStyle, width: '140px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="all">Все месяцы</option>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...inputStyle, width: '100px' }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
            {years.sort().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Показатели */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '14px', background: '#f7f8fa', borderRadius: '12px', overflow: 'hidden', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '140px', padding: '12px 16px', borderRight: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Баланс</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: isPaid ? '#059669' : '#dc2626' }}>
              {balance.toLocaleString()} сум
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '140px', padding: '12px 16px', borderRight: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Оплачено ({periodLabel})</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>{income.toLocaleString()} сум</div>
          </div>
          <div style={{ flex: 1, minWidth: '140px', padding: '12px 16px', borderRight: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Занятий ({periodLabel})</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#7c3aed' }}>{sessions}</div>
          </div>
          <div style={{ flex: 1, minWidth: '140px', padding: '12px 16px' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Списано ({periodLabel})</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#ea580c' }}>{sessionsCost.toLocaleString()} сум</div>
          </div>
        </div>

        {/* Действия */}
        {!form.open && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <button onClick={() => setForm({ open: true, type: 'income', amount: '', sessions: '', description: '' })} style={btn('#059669')}>
              💰 Принять оплату
            </button>
            <button onClick={() => setForm({ open: true, type: 'session', amount: '', sessions: '', description: '' })} style={btn()}>
              🏃 Записать занятие
            </button>
          </div>
        )}

        {form.open && (
          <div style={{ background: '#f7f8fa', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
            <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: form.type === 'income' ? '#059669' : '#7c3aed' }}>
              {form.type === 'income' ? '💰 Принять оплату' : '🏃 Записать занятие'}
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  {form.type === 'income' ? 'Сумма оплаты (сум) *' : 'Стоимость занятия (сум) *'}
                </label>
                <input type="number" min="0" placeholder="0" style={{ ...inputStyle, width: '140px' }}
                  value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              {form.type === 'session' && (
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Кол-во занятий</label>
                  <input type="number" min="1" placeholder="1" style={{ ...inputStyle, width: '100px' }}
                    value={form.sessions} onChange={e => setForm({ ...form, sessions: e.target.value })} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Комментарий</label>
                <input placeholder="Необязательно" style={inputStyle}
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <button onClick={handlePayment} disabled={saving || !form.amount}
                style={{ ...btn(form.type === 'income' ? '#059669' : '#7c3aed'), opacity: (!form.amount || saving) ? 0.6 : 1 }}>
                Сохранить
              </button>
              <button onClick={() => setForm({ open: false })} style={{
                background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
                padding: '8px 14px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer',
              }}>✕</button>
            </div>
          </div>
        )}

        {/* История */}
        {periodPayments.length > 0 && (
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>История {periodLabel}</p>
            {periodPayments.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < periodPayments.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    {p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString('ru') : '—'}
                  </span>
                  {p.type === 'income' ? (
                    <span style={chip('#dcfce7', '#059669')}>💰 Оплата</span>
                  ) : (
                    <span style={chip('#ede9fe', '#5b21b6')}>🏃 {p.sessions} зан.</span>
                  )}
                  {p.description && <span style={{ fontSize: '12px', color: '#6b7280' }}>{p.description}</span>}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: p.type === 'income' ? '#059669' : '#dc2626' }}>
                    {p.type === 'income' ? '+' : '-'}{(p.amount || 0).toLocaleString()} сум
                  </span>
                  <button onClick={() => handleDeletePayment(p.id)} style={{
                    background: 'transparent', color: '#9ca3af', border: 'none',
                    cursor: 'pointer', fontSize: '14px', padding: '2px 6px',
                  }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
