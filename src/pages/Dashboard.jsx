import { useEffect, useMemo, useState } from 'react'
import { auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { readCollection, readClientMoney, invalidate } from '../lib/store'
import ErrorBanner from '../components/ErrorBanner'
import Icon from '../components/Icon'
import Avatar from '../components/Avatar'
import { KIND_INCOME, incomeTotal, toJsDate } from '../lib/finance'
import { clientBalances, debtAndPrepaid } from '../lib/balance'
import { isLeadClient } from '../lib/client'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '16px 18px',
}

export default function Dashboard() {
  const [clients, setClients] = useState([])
  const [transactions, setTransactions] = useState([])
  const [charges, setCharges] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const fetchData = async (force = false) => {
    setLoadError('')
    // После своей записи читаем заново — и сбрасываем кэш целиком, иначе соседняя
    // страница (например, «Финансы») покажет ленту без только что принятой оплаты.
    if (force) invalidate()
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [cs, tx, ch] = await Promise.all([
        readCollection('clients', { force }),
        readClientMoney({ force }),
        readCollection('charges', { force }),
      ])
      setClients(cs)
      setTransactions(tx)
      setCharges(ch)
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const clientsById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const balances = useMemo(() => clientBalances(transactions, charges), [transactions, charges])
  const getClientBalance = (clientId) => balances.get(clientId) || 0

  // Карточки лидов лежат в той же коллекции, но учениками ещё не стали —
  // в списке «Клиенты» их нет, и в счётчике быть не должно.
  const students = clients.filter(c => !isLeadClient(c))

  const totalIncome = incomeTotal(transactions)
  const { debt: totalDebt } = debtAndPrepaid(balances)
  const debtors = clients.filter(c => getClientBalance(c.id) < 0)

  // Только фактические оплаты. Проведённое, но не оплаченное занятие — это долг,
  // и он виден в карточке ученика, а не среди платежей.
  const recentPayments = transactions
    .filter(t => t.kind === KIND_INCOME)
    .sort((a, b) => (toJsDate(b.date)?.getTime() || 0) - (toJsDate(a.date)?.getTime() || 0))
    .slice(0, 6)

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: '960px' }}>
     {/* Header */}
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '19px', fontWeight: '700', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="dashboard" size={20} style={{ color: '#7c3aed' }} />Дашборд
          </h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Общая статистика центра</p>
      </div>

      <ErrorBanner message={loadError} onRetry={fetchData} />

     {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={card}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Клиентов</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#7c3aed', margin: 0 }}>{students.length}</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Получено</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: '#059669', margin: 0 }}>{totalIncome.toLocaleString()} сум</p>
        </div>
        <div style={{
          ...card,
          border: totalDebt > 0 ? '1px solid #fee2e2' : '1px solid #e5e7eb',
          background: totalDebt > 0 ? '#fef2f2' : '#ffffff',
        }}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
            Долги {debtors.length > 0 && <span style={{ color: '#dc2626' }}>({debtors.length} клиент{debtors.length > 1 ? 'а' : ''})</span>}
          </p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: totalDebt > 0 ? '#dc2626' : '#6b7280', margin: 0 }}>
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
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: i < recentPayments.length - 1 ? '1px solid #e5e7eb' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Avatar client={clientsById.get(p.clientId)} size={36} />
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 }}>
                       {p.clientName || p.payerName || '—'}
                      </p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                       {date ? date.toLocaleDateString('ru') : '—'}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: '#059669' }}>
                    +{(p.amount || 0).toLocaleString()} сум
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
