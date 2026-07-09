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
  clientToForm, instagramUrl, telegramUrl, phoneUrl, parentPhones,
} from '../lib/client'

const panel = {
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
  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
}

const chip = (background, color) => ({
  fontSize: '12px', background, color, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
})

const link = { color: '#7c3aed', textDecoration: 'none' }

const notSet = { color: '#dc2626', fontStyle: 'italic', fontSize: '13px' }

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

// Строка правой колонки-сводки: подпись слева, значение справа.
function SummaryRow({ label, children, action }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '8px 0', fontSize: '13px', alignItems: 'baseline',
    }}>
      <span style={{ color: '#6b7280', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#111827', textAlign: 'right', minWidth: 0 }}>
        {children}
        {action}
      </span>
    </div>
  )
}

function SummaryBlock({ title, action, children }) {
  return (
    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '12px', marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

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
  const incomeCount = sorted.filter(p => p.type === 'income').length
  const lessonsDone = sum(sorted, 'session', 'sessions')

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
      <div style={{ maxWidth: '1100px' }}>
        <ErrorBanner message={loadError} onRetry={fetchData} />
        <p style={{ color: '#6b7280' }}>Клиент не найден.</p>
        <Link to="/clients" style={link}>← К списку клиентов</Link>
      </div>
    )
  }

  if (editing) {
    return (
      <div style={{ maxWidth: '1100px' }}>
        <Link to="/clients" style={{ ...link, fontSize: '13px' }}>← К списку</Link>
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

  const age = getAge(client)
  const gender = genderInfo(client)
  const source = sourceInfo(client)
  const status = statusInfo(client)
  const birthday = formatBirthday(client.birthDate)
  const contacts = contactRows(client)
  const isPaid = balance >= 0
  const periodLabel = filterMonth !== 'all' ? `${MONTHS[filterMonth]} ${filterYear}` : 'за всё время'

  // Заказчик — тот, кто платит: юрлицо или родитель (мама приоритетнее).
  const legalPayer = client.payerType === 'legal'
    ? legalEntities.find(e => e.id === client.legalEntityId)
    : null
  const mainParent = contacts.find(r => r.name) || contacts[0] || null
  const mainPhone = mainParent ? parentPhones(mainParent)[0] : null

  const years = [...new Set(sorted.map(p => p.date?.seconds
    ? new Date(p.date.seconds * 1000).getFullYear() : null).filter(Boolean))]
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear())

  return (
    <div style={{ maxWidth: '1100px' }}>
      <Link to="/clients" style={{ ...link, fontSize: '13px' }}>← К списку клиентов</Link>
      <div style={{ height: '14px' }} />

      <ErrorBanner message={loadError} onRetry={fetchData} />

      <div className="client-card-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '16px', alignItems: 'start',
      }}>
        {/* ЛЕВАЯ КОЛОНКА */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {gender && <span style={{ fontSize: '20px' }} title={gender.label}>{gender.icon}</span>}
                  <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>{client.childName}</h2>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  <span style={chip(status.background, status.color)}>{status.label}</span>
                  <span style={chip(isPaid ? '#dcfce7' : '#fee2e2', isPaid ? '#059669' : '#dc2626')}>
                    {isPaid ? '✅ Оплачено' : '🔴 Долг'}
                  </span>
                  {age !== null && <span style={chip('#f3f4f6', '#4b5563')}>{ageLabel(age)}</span>}
                  {birthday && <span style={chip('#f3f4f6', '#4b5563')}>🎂 {birthday}</span>}
                  {source && <span style={chip('#ede9fe', '#5b21b6')}>{source.icon} {source.label}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => setEditing(true)} style={secondaryBtn}>Изменить</button>
                <button onClick={handleDeleteClient} style={secondaryBtn}>Удалить</button>
              </div>
            </div>

            {client.notes && (
              <p style={{
                marginTop: '14px', padding: '10px 12px', background: '#f7f8fa',
                borderRadius: '10px', fontSize: '13px', color: '#4b5563',
              }}>{client.notes}</p>
            )}
          </div>

          {/* Виджет посещений */}
          <div style={panel}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', margin: '0 0 12px' }}>
              Виджет посещений
            </h3>
            <div style={{
              padding: '24px', background: '#f7f8fa', borderRadius: '12px',
              textAlign: 'center', color: '#6b7280', fontSize: '13px',
            }}>
              Появится вместе с уроками и расписанием.<br />
              Плитки с датами, цвет — оплата, значок — посещение.
            </div>
          </div>

          {/* Уроки и оплаты */}
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', margin: 0 }}>
                Уроки и оплаты
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select style={{ ...inputStyle, width: '120px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                  <option value="all">Все месяцы</option>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select style={{ ...inputStyle, width: '90px' }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
                  {years.sort().map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

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
                  <div style={{ flex: 1, minWidth: '150px' }}>
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

            {periodPayments.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '13px' }}>Записей {periodLabel} нет</p>
            ) : (
              <div>
                {periodPayments.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', gap: '10px',
                    borderBottom: i < periodPayments.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
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
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
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

        {/* ПРАВАЯ КОЛОНКА — сводка */}
        <aside style={{ ...panel, position: 'sticky', top: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>Общий остаток</span>
          </div>
          <div style={{ textAlign: 'right', marginBottom: '4px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#7c3aed' }}>0 уроков</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: isPaid ? '#059669' : '#dc2626' }}>
              {balance.toLocaleString()} сум
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '12px', paddingTop: '4px' }}>
            <SummaryRow label="ID">#{client.id.slice(0, 6)}</SummaryRow>
            <SummaryRow label="Платежи">{incomeCount} шт</SummaryRow>
            <SummaryRow label="Уроки">ф {lessonsDone}</SummaryRow>
            {Number.isFinite(client.lessonPrice) && (
              <SummaryRow label="Цена занятия">{client.lessonPrice.toLocaleString()} сум</SummaryRow>
            )}
          </div>

          <SummaryBlock title="Педагог">
            <span style={notSet}>(не задано)</span>
          </SummaryBlock>

          <SummaryBlock title="Заказчик">
            {legalPayer ? (
              <div style={{ fontSize: '13px', color: '#111827' }}>🏛️ {legalPayer.name}</div>
            ) : mainParent ? (
              <div style={{ fontSize: '13px', color: '#111827' }}>
                {mainParent.icon} {mainParent.name || mainParent.role}
                {mainParent.telegram && (
                  <>
                    {' '}
                    <a href={telegramUrl(mainParent.telegram)} target="_blank" rel="noreferrer" style={link}>
                      @{mainParent.telegram}
                    </a>
                  </>
                )}
              </div>
            ) : <span style={notSet}>(не задано)</span>}
            {mainPhone && (
              <div style={{ marginTop: '4px' }}>
                <a href={phoneUrl(mainPhone)} style={{ ...link, fontSize: '13px' }}>{mainPhone}</a>
              </div>
            )}
          </SummaryBlock>

          <SummaryBlock title="Контакты">
            {contacts.length === 0 && <span style={notSet}>(не задано)</span>}
            {contacts.map(r => (
              <div key={r.role} style={{ fontSize: '12px', color: '#4b5563', marginBottom: '6px' }}>
                <div style={{ color: '#6b7280' }}>{r.icon} {r.role} {r.name}</div>
                {parentPhones(r).map((phone, i) => (
                  <div key={`${phone}-${i}`}><a href={phoneUrl(phone)} style={link}>{phone}</a></div>
                ))}
                {r.instagram && (
                  <a href={instagramUrl(r.instagram)} target="_blank" rel="noreferrer" style={link}>📸 @{r.instagram}</a>
                )}
              </div>
            ))}
            {client.childContacts && (
              <div style={{ fontSize: '12px', color: '#4b5563' }}>
                <span style={{ color: '#6b7280' }}>🧒 Ребёнок</span> {client.childContacts}
              </div>
            )}
          </SummaryBlock>

          <SummaryBlock title="Счета и абонементы">
            <span style={notSet}>(не задано)</span>
          </SummaryBlock>

          <SummaryBlock title="Аллергии и особенности">
            {client.allergies
              ? <span style={{ fontSize: '13px', color: '#b91c1c' }}>⚠️ {client.allergies}</span>
              : <span style={notSet}>(не задано)</span>}
          </SummaryBlock>

          <SummaryBlock title="Группы">
            <span style={notSet}>(не задано)</span>
          </SummaryBlock>
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .client-card-grid { grid-template-columns: 1fr !important; }
          .client-card-grid > aside { position: static !important; }
        }
      `}</style>
    </div>
  )
}
