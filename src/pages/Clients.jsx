import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ClientForm from '../components/ClientForm'
import ErrorBanner from '../components/ErrorBanner'
import { lessonsLeft } from '../lib/subscription'
import {
  getAge, ageLabel, contactRows, statusInfo, genderInfo, searchText,
  CLIENT_STATUSES, instagramUrl, telegramUrl, phoneUrl,
} from '../lib/client'

const PAGE_SIZE = 50

const inputStyle = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '8px 12px',
  color: '#111827',
  fontSize: '14px',
  outline: 'none',
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

const th = {
  textAlign: 'left', padding: '12px 14px', color: '#6b7280',
  fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
}

const td = (isLast) => ({
  padding: '12px 14px', fontSize: '13px', color: '#4b5563',
  borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
  verticalAlign: 'top',
})

const link = { color: '#4b5563', textDecoration: 'none' }

const muted = { color: '#dc2626', fontStyle: 'italic', fontSize: '12px' }

// Формат даты рождения под ФИО: «10 лет (04.09.2015)»
function birthLine(client) {
  const age = getAge(client)
  const date = client.birthDate
    ? new Date(client.birthDate).toLocaleDateString('ru')
    : ''
  if (age === null && !date) return ''
  if (age === null) return date
  return date ? `${ageLabel(age)} (${date})` : ageLabel(age)
}

function Avatar({ client }) {
  const gender = genderInfo(client)
  return (
    <div style={{
      width: '34px', height: '34px', borderRadius: '50%', background: '#f3f4f6',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
    }}>
      {gender ? gender.icon : '🧒'}
    </div>
  )
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [legalEntities, setLegalEntities] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showAddClient, setShowAddClient] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterBalance, setFilterBalance] = useState('all')
  const [page, setPage] = useState(1)

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [cs, ps, les, ss] = await withTimeout(Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'legalEntities')),
        getDocs(collection(db, 'subscriptions')),
      ]))
      setClients(cs.docs.map(d => ({ id: d.id, ...d.data() })))
      setPayments(ps.docs.map(d => ({ id: d.id, ...d.data() })))
      setLegalEntities(les.docs.map(d => ({ id: d.id, ...d.data() })))
      setSubscriptions(ss.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const getBalance = (clientId) => {
    const ps = payments.filter(p => p.clientId === clientId)
    const income = ps.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
    const spent = ps.filter(p => p.type === 'session').reduce((s, p) => s + (p.amount || 0), 0)
    return income - spent
  }

  const handleAddClient = async (data) => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'clients'), { ...data, createdAt: new Date() })
      setShowAddClient(false)
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (client) => {
    if (!confirm(`Удалить «${client.childName}» и все его платежи?`)) return
    try {
      await deleteDoc(doc(db, 'clients', client.id))
      await Promise.all(
        payments.filter(p => p.clientId === client.id).map(p => deleteDoc(doc(db, 'payments', p.id)))
      )
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    }
  }

  const query = search.trim().toLowerCase()
  const filtered = clients
    .filter(c => {
      if (query && !searchText(c).includes(query)) return false
      if (filterStatus !== 'all' && (c.status || 'active') !== filterStatus) return false
      const balance = getBalance(c.id)
      if (filterBalance === 'debt') return balance < 0
      if (filterBalance === 'paid') return balance >= 0
      return true
    })
    .sort((a, b) => String(a.childName || '').localeCompare(String(b.childName || ''), 'ru'))

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeFrom = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeTo = Math.min(currentPage * PAGE_SIZE, filtered.length)

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>👶 Клиенты</h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>{clients.length} учеников в базе</p>
        </div>
        <button onClick={() => setShowAddClient(!showAddClient)} style={btn()}>+ Добавить клиента</button>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {showAddClient && (
        <ClientForm
          saving={saving}
          legalEntities={legalEntities}
          onSubmit={handleAddClient}
          onCancel={() => setShowAddClient(false)}
        />
      )}

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input placeholder="🔍 Поиск по имени, телефону, нику..." style={{ ...inputStyle, width: '280px' }}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select style={{ ...inputStyle, width: '160px' }} value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
          <option value="all">Все статусы</option>
          {CLIENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select style={{ ...inputStyle, width: '170px' }} value={filterBalance}
          onChange={e => { setFilterBalance(e.target.value); setPage(1) }}>
          <option value="all">Любой баланс</option>
          <option value="paid">✅ Есть баланс</option>
          <option value="debt">🔴 Долг</option>
        </select>
      </div>

      {/* Счётчик и пагинация */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px', flexWrap: 'wrap', gap: '10px',
      }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {pageCount > 1 && Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPage(n)} style={{
              minWidth: '32px', padding: '5px 8px', borderRadius: '8px', fontSize: '13px',
              cursor: 'pointer', fontWeight: '600',
              background: n === currentPage ? '#7c3aed' : '#ffffff',
              color: n === currentPage ? '#fff' : '#4b5563',
              border: `1px solid ${n === currentPage ? '#7c3aed' : '#e5e7eb'}`,
            }}>{n}</button>
          ))}
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          Отображены строки {rangeFrom} — {rangeTo}. Всего {filtered.length}
          {filtered.length !== clients.length && ` из ${clients.length}`}.
        </p>
      </div>

      {/* Таблица */}
      {filtered.length === 0 ? (
        <div style={{
          background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px',
          padding: '40px', textAlign: 'center',
        }}>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Клиентов не найдено</p>
        </div>
      ) : (
        <div style={{
          background: '#ffffff', border: '1px solid #e5e7eb',
          borderRadius: '16px', overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '50px' }} />
                <th style={th}>ФИО</th>
                <th style={th}>Общий остаток</th>
                <th style={th}>Статус обучения</th>
                <th style={th}>Контакты</th>
                <th style={th}>Примечание</th>
                <th style={th}>Дата след. посещения</th>
                <th style={{ ...th, width: '40px' }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((c, i) => {
                const isLast = i === visible.length - 1
                const balance = getBalance(c.id)
                const status = statusInfo(c)
                const contacts = contactRows(c)
                const birth = birthLine(c)

                return (
                  <tr key={c.id}>
                    <td style={td(isLast)}><Avatar client={c} /></td>

                    <td style={td(isLast)}>
                      <Link to={`/clients/${c.id}`} style={{
                        color: '#7c3aed', fontWeight: '600', fontSize: '14px', textDecoration: 'none',
                      }}>
                        {c.childName}
                      </Link>
                      {c.allergies && (
                        <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>⚠️ {c.allergies}</div>
                      )}
                      {birth && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{birth}</div>}
                    </td>

                    <td style={{ ...td(isLast), whiteSpace: 'nowrap' }}>
                      <span style={{ color: balance < 0 ? '#dc2626' : '#111827', fontWeight: balance !== 0 ? '600' : '400' }}>
                        {balance.toLocaleString()} сум
                      </span>
                      <span style={{ color: '#9ca3af' }}> / {lessonsLeft(subscriptions, c.id)} уроков</span>
                    </td>

                    <td style={td(isLast)}>
                      <span style={{
                        fontSize: '12px', padding: '3px 10px', borderRadius: '6px',
                        background: status.background, color: status.color, whiteSpace: 'nowrap',
                      }}>{status.label}</span>
                    </td>

                    <td style={td(isLast)}>
                      {contacts.length === 0 && <span style={{ color: '#9ca3af' }}>—</span>}
                      {contacts.map(r => (
                        <div key={r.role} style={{ marginBottom: '4px' }}>
                          {r.phones.map((phone, idx) => (
                            <div key={`${phone}-${idx}`} style={{ fontSize: '12px' }}>
                              <a href={phoneUrl(phone)} style={{ ...link, color: '#7c3aed' }}>📞 {phone}</a>
                              {(r.name || r.telegram) && (
                                <span style={{ color: '#6b7280' }}>
                                  {' '}({[r.name, r.role.toLowerCase()].filter(Boolean).join(' ')}
                                  {r.telegram && ' '}
                                  {r.telegram && (
                                    <a href={telegramUrl(r.telegram)} target="_blank" rel="noreferrer" style={link}>@{r.telegram}</a>
                                  )})
                                </span>
                              )}
                            </div>
                          ))}
                          {r.phones.length === 0 && r.instagram && (
                            <div style={{ fontSize: '12px' }}>
                              <a href={instagramUrl(r.instagram)} target="_blank" rel="noreferrer" style={link}>📸 @{r.instagram}</a>
                            </div>
                          )}
                        </div>
                      ))}
                    </td>

                    <td style={{ ...td(isLast), maxWidth: '180px' }}>
                      {c.notes || <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>

                    <td style={td(isLast)}>
                      <span style={muted}>(не задано)</span>
                    </td>

                    <td style={{ ...td(isLast), textAlign: 'right' }}>
                      <button onClick={() => handleDelete(c)} title="Удалить клиента" style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: '15px', color: '#dc2626', padding: '2px 4px',
                      }}>🗑</button>
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
