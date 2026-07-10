import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import ErrorBanner from '../components/ErrorBanner'
import { KIND_INCOME, incomeTotal, toJsDate } from '../lib/finance'
import { clientBalances, debtAndPrepaid } from '../lib/balance'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
}

export default function Dashboard() {
  const [clients, setClients] = useState([])
  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [clientsSnap, txSnap, chargesSnap] = await withTimeout(Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'transactions')),
        getDocs(collection(db, 'charges')),
      ]))
      setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCharges(chargesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const balances = useMemo(() => clientBalances(transactions, charges), [transactions, charges])
  const getClientBalance = (clientId) => balances.get(clientId) || 0

  const totalIncome = incomeTotal(transactions)
  const { debt: totalDebt } = debtAndPrepaid(balances)
  const debtors = clients.filter(c => getClientBalance(c.id) < 0)

  // Лента последних движений: оплаты и начисления вперемешку.
  const recentPayments = [
    ...transactions.filter(t => t.kind === KIND_INCOME).map(t => ({ ...t, _charge: false })),
    ...charges.map(c => ({ ...c, _charge: true })),
  ]
    .sort((a, b) => (toJsDate(b.date)?.getTime() || 0) - (toJsDate(a.date)?.getTime() || 0))
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
            {recentPayments.map((p, i) => {
              const date = toJsDate(p.date)
              return (
                <div key={`${p._charge ? 'c' : 't'}-${p.id}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: i < recentPayments.length - 1 ? '1px solid #e5e7eb' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: p._charge ? '#ffedd5' : '#dcfce7',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
                    }}>
                      {p._charge ? '🏃' : '💰'}
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 }}>{p.clientName || '—'}</p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                        {date ? date.toLocaleDateString('ru') : '—'}
                        {p._charge && p.lessons > 0 && ` · ${p.lessons} зан.`}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    fontWeight: '700', fontSize: '15px',
                    color: p._charge ? '#dc2626' : '#059669'
                  }}>
                    {p._charge ? '−' : '+'}{(p.amount || 0).toLocaleString()} сум
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
