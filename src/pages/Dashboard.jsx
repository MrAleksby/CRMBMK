import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ErrorBanner from '../components/ErrorBanner'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
}

export default function Dashboard() {
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [clientsSnap, paymentsSnap] = await withTimeout(Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'payments')),
      ]))
      setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPayments(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Баланс конкретного клиента
  const getClientBalance = (clientId) => {
    const ps = payments.filter(p => p.clientId === clientId)
    const income = ps.filter(p => p.type === 'income').reduce((s, p) => s + (p.amount || 0), 0)
    const sessions = ps.filter(p => p.type === 'session').reduce((s, p) => s + (p.amount || 0), 0)
    return income - sessions
  }

  // Общие доходы (все оплаты клиентов)
  const totalIncome = payments
    .filter(p => p.type === 'income')
    .reduce((s, p) => s + (p.amount || 0), 0)

  // Долги = сумма отрицательных балансов клиентов
  const totalDebt = clients.reduce((sum, c) => {
    const balance = getClientBalance(c.id)
    return balance < 0 ? sum + Math.abs(balance) : sum
  }, 0)

  // Должники
  const debtors = clients.filter(c => getClientBalance(c.id) < 0)

  const recentPayments = [...payments]
    .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
    .slice(0, 6)

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>📊 Дашборд</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Общая статистика центра</p>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={card}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Клиентов</p>
          <p style={{ fontSize: '36px', fontWeight: '700', color: '#7c3aed', margin: 0 }}>{clients.length}</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Получено</p>
          <p style={{ fontSize: '28px', fontWeight: '700', color: '#059669', margin: 0 }}>{totalIncome.toLocaleString()} сум</p>
        </div>
        <div style={{
          ...card,
          border: totalDebt > 0 ? '1px solid #fee2e2' : '1px solid #e5e7eb',
          background: totalDebt > 0 ? '#fef2f2' : '#ffffff',
        }}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
            Долги {debtors.length > 0 && <span style={{ color: '#dc2626' }}>({debtors.length} клиент{debtors.length > 1 ? 'а' : ''})</span>}
          </p>
          <p style={{ fontSize: '28px', fontWeight: '700', color: totalDebt > 0 ? '#dc2626' : '#6b7280', margin: 0 }}>
            {totalDebt.toLocaleString()} сум
          </p>
        </div>
      </div>

      {/* Recent payments */}
      <div style={card}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Последние платежи</h3>
        {recentPayments.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Нет платежей — добавьте клиентов и финансы</p>
        ) : (
          <div>
            {recentPayments.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: i < recentPayments.length - 1 ? '1px solid #e5e7eb' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: p.type === 'income' ? '#dcfce7' : '#ede9fe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
                  }}>
                    {p.type === 'income' ? '💰' : '🏃'}
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 }}>{p.clientName || '—'}</p>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                      {p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString('ru') : '—'}
                      {p.type === 'session' && p.sessions > 0 && ` · ${p.sessions} зан.`}
                    </p>
                  </div>
                </div>
                <span style={{
                  fontWeight: '700', fontSize: '15px',
                  color: p.type === 'income' ? '#059669' : '#dc2626'
                }}>
                  {p.type === 'income' ? '+' : '-'}{(p.amount || 0).toLocaleString()} сум
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
