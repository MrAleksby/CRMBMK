import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

export default function Dashboard() {
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const clientsSnap = await getDocs(collection(db, 'clients'))
        const paymentsSnap = await getDocs(collection(db, 'payments'))
        setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        setPayments(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const totalRevenue = payments
    .filter(p => p.type === 'income')
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  const totalDebt = payments
    .filter(p => p.type === 'debt')
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  const recentPayments = [...payments]
    .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
    .slice(0, 5)

  if (loading) return <div className="text-gray-500">Загрузка...</div>

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-6">Дашборд</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Всего клиентов</p>
          <p className="text-4xl font-bold text-indigo-600">{clients.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Общий доход</p>
          <p className="text-4xl font-bold text-green-600">{totalRevenue.toLocaleString()} ₽</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Задолженности</p>
          <p className="text-4xl font-bold text-red-500">{totalDebt.toLocaleString()} ₽</p>
        </div>
      </div>

      {/* Recent payments */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Последние платежи</h3>
        {recentPayments.length === 0 ? (
          <p className="text-gray-400 text-sm">Нет платежей</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b">
                <th className="pb-2">Клиент</th>
                <th className="pb-2">Сумма</th>
                <th className="pb-2">Тип</th>
                <th className="pb-2">Дата</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map(p => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-3">{p.clientName || '—'}</td>
                  <td className="py-3 font-medium">{(p.amount || 0).toLocaleString()} ₽</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      p.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {p.type === 'income' ? 'Оплата' : 'Долг'}
                    </span>
                  </td>
                  <td className="py-3 text-gray-400">
                    {p.date?.seconds
                      ? new Date(p.date.seconds * 1000).toLocaleDateString('ru')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
