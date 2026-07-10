import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, addDoc, doc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ClientForm from '../components/ClientForm'
import ErrorBanner from '../components/ErrorBanner'
import { lessonsLeft } from '../lib/subscription'
import { clientBalances } from '../lib/balance'
import { useSelection } from '../lib/selection'
import ActionToolbar from '../components/ActionToolbar'
import {
  getAge, ageLabel, contactRows, statusInfo, genderInfo, searchText, sortClients,
  CLIENT_STATUSES, instagramUrl, telegramUrl, phoneUrl,
} from '../lib/client'

const PAGE_SIZE = 50

// Колонки таблицы. Клик по заголовку сортирует, как в AlfaCRM.
// «Дата след. посещения» пока не считается, сортировать нечего.
const COLUMNS = [
  { key: 'name', label: 'ФИО' },
  { key: 'balance', label: 'Общий остаток' },
  { key: 'status', label: 'Статус обучения' },
  { key: 'contacts', label: 'Контакты' },
  { key: 'notes', label: 'Примечание' },
]

const inputStyle = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '8px 12px',
  color: '#111827',
  fontSize: '14px',
  outline: 'none',
}

// Шрифты и отступы в таблице мельче, чем на остальных экранах: так на страницу
// помещается больше строк, и список читается как в AlfaCRM.
const th = {
  textAlign: 'left', padding: '9px 12px', color: '#6b7280',
  fontSize: '11px', fontWeight: '600', borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
}

const td = (isLast) => ({
  padding: '9px 12px', fontSize: '12px', color: '#4b5563',
  borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
  verticalAlign: 'top',
})

const link = { color: '#4b5563', textDecoration: 'none' }

const muted = { color: '#dc2626', fontStyle: 'italic', fontSize: '11px' }

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
      width: '30px', height: '30px', borderRadius: '50%', background: '#f3f4f6',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
    }}>
      {gender ? gender.icon : '🧒'}
    </div>
  )
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
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
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  // Повторный клик по той же колонке переворачивает порядок. Деньги и возраст
  // впервые полезнее видеть по убыванию: сначала крупные должники и старшие.
  const toggleSort = (key) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'balance' ? 'desc' : 'asc') }
    setPage(1)
  }

  const navigate = useNavigate()
  const selection = useSelection(clients)

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [cs, tx, ch, les, ss] = await withTimeout(Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'transactions')),
        getDocs(collection(db, 'charges')),
        getDocs(collection(db, 'legalEntities')),
        getDocs(collection(db, 'subscriptions')),
      ]))
      setClients(cs.docs.map(d => ({ id: d.id, ...d.data() })))
      setTransactions(tx.docs.map(d => ({ id: d.id, ...d.data() })))
      setCharges(ch.docs.map(d => ({ id: d.id, ...d.data() })))
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

  // Один проход по всем операциям вместо пересчёта на каждого клиента.
  const balances = useMemo(() => clientBalances(transactions, charges), [transactions, charges])
  const getBalance = (clientId) => balances.get(clientId) || 0

  const chargesBy = useMemo(() => {
    const map = new Map()
    for (const charge of charges) {
      if (!map.has(charge.clientId)) map.set(charge.clientId, [])
      map.get(charge.clientId).push(charge)
    }
    return map
  }, [charges])

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

  // Ученики и их деньги удаляются одной транзакцией: оборванное удаление
  // оставило бы операции без владельца. Больше 400 записей Firestore в один
  // batch не примет, поэтому режем на части.
  const handleDeleteSelected = async () => {
    const chosen = selection.rows
    if (chosen.length === 0) return

    const names = chosen.slice(0, 3).map(c => c.childName).join(', ')
    const tail = chosen.length > 3 ? ` и ещё ${chosen.length - 3}` : ''
    const message = chosen.length === 1
      ? `Удалить «${chosen[0].childName}»? Вместе с ним удалятся его оплаты, начисления и абонементы.`
      : `Удалить учеников: ${chosen.length} (${names}${tail})?\n\nВместе с ними удалятся их оплаты, начисления и абонементы.`
    if (!confirm(message)) return

    const ids = new Set(chosen.map(c => c.id))
    const refs = [
      ...transactions.filter(t => ids.has(t.clientId)).map(t => doc(db, 'transactions', t.id)),
      ...charges.filter(c => ids.has(c.clientId)).map(c => doc(db, 'charges', c.id)),
      ...subscriptions.filter(s => ids.has(s.clientId)).map(s => doc(db, 'subscriptions', s.id)),
      ...chosen.map(c => doc(db, 'clients', c.id)),
    ]

    setSaving(true)
    try {
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db)
        for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
        await batch.commit()
      }
      selection.clear()
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const query = search.trim().toLowerCase()
  const matching = clients.filter(c => {
    if (query && !searchText(c).includes(query)) return false
    if (filterStatus !== 'all' && (c.status || 'active') !== filterStatus) return false
    const balance = getBalance(c.id)
    if (filterBalance === 'debt') return balance < 0
    if (filterBalance === 'paid') return balance >= 0
    return true
  })
  const filtered = sortClients(matching, sortKey, sortDir, { balance: getBalance })

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

      {/* Кнопки стоят прямо над таблицей: они работают с отмеченными строками. */}
      <ActionToolbar
        count={selection.count}
        busy={saving}
        addLabel="✚ Добавить ученика"
        editLabel="✎ Открыть карточку"
        onAdd={() => setShowAddClient(true)}
        onEdit={() => selection.rows.length === 1 && navigate(`/clients/${selection.rows[0].id}`)}
        onDelete={handleDeleteSelected}
        onClear={selection.clear}
      />

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
                <th style={{ ...th, width: '36px' }}>
                  <input type="checkbox" title="Отметить всех на странице"
                    checked={selection.allVisibleChecked(visible)}
                    onChange={() => selection.toggleVisible(visible)} />
                </th>
                <th style={{ ...th, width: '50px' }} />
                {COLUMNS.map(col => (
                  <th key={col.key} style={{ ...th, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort(col.key)}
                    title="Нажмите, чтобы отсортировать">
                    {col.label}
                    <span style={{ color: sortKey === col.key ? '#7c3aed' : '#d1d5db', marginLeft: '4px' }}>
                      {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                ))}
                <th style={th}>Дата след. посещения</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, i) => {
                const isLast = i === visible.length - 1
                const balance = getBalance(c.id)
                const status = statusInfo(c)
                const contacts = contactRows(c)
                const birth = birthLine(c)

                const checked = selection.selected.has(c.id)

                return (
                  <tr key={c.id} style={{ background: checked ? '#ede9fe' : 'transparent' }}>
                    <td style={td(isLast)}>
                      <input type="checkbox" checked={checked} onChange={() => selection.toggle(c.id)} />
                    </td>
                    <td style={td(isLast)}><Avatar client={c} /></td>

                    <td style={td(isLast)}>
                      <Link to={`/clients/${c.id}`} style={{
                        color: '#7c3aed', fontWeight: '600', fontSize: '13px', textDecoration: 'none',
                      }}>
                        {c.childName}
                      </Link>
                      {c.allergies && (
                        <div style={{ fontSize: '10px', color: '#b91c1c', marginTop: '2px' }}>⚠️ {c.allergies}</div>
                      )}
                      {birth && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{birth}</div>}
                    </td>

                    <td style={{ ...td(isLast), whiteSpace: 'nowrap' }}>
                      <span style={{ color: balance < 0 ? '#dc2626' : '#111827', fontWeight: balance !== 0 ? '600' : '400' }}>
                        {balance.toLocaleString()} сум
                      </span>
                      {(() => {
                        // Минус — за столько занятий ученик ещё не заплатил.
                        const left = lessonsLeft(subscriptions, c.id, balance, chargesBy.get(c.id) || [], c)
                        return (
                          <span style={{ color: left < 0 ? '#dc2626' : '#9ca3af' }}> / {left} уроков</span>
                        )
                      })()}
                    </td>

                    <td style={td(isLast)}>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
                        background: status.background, color: status.color, whiteSpace: 'nowrap',
                      }}>{status.label}</span>
                    </td>

                    <td style={td(isLast)}>
                      {contacts.length === 0 && <span style={{ color: '#9ca3af' }}>—</span>}
                      {contacts.map(r => (
                        <div key={r.role} style={{ marginBottom: '4px' }}>
                          {r.phones.map((phone, idx) => (
                            <div key={`${phone}-${idx}`} style={{ fontSize: '11px' }}>
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
                            <div style={{ fontSize: '11px' }}>
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
