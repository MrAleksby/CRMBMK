import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

const emptyForm = {
  clientName: '',
  amount: '',
  type: 'income',
  description: '',
}

export default function Finance() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchPayments = async () => {
    const snap = await getDocs(collection(db, 'payments'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
    setPayments(data)
    setLoading(false)
  }

  useEffect(() => { fetchPayments() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await addDoc(collection(db, 'payments'), {
        ...form,
        amount: Number(form.amount),
        date: new Date(),
      })
      setForm(emptyForm)
      setShowForm(false)
      fetchPayments()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить запись?')) return
    await deleteDoc(doc(db, 'payments', id))
    fetchPayments()
  }

  const totalIncome = payments.filter(p => p.type === 'income').reduce((s, p) => s + p.amount, 0)
  const totalDebt = payments.filter(p => p.type === 'debt').reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Финансы</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition"
        >
          + Добавить запись
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
          <p className="text-sm text-green-600 mb-1">Общий доход</p>
          <p className="text-3xl font-bold text-green-700">{totalIncome.toLocaleString()} ₽</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
          <p className="text-sm text-red-500 mb-1">Задолженности</p>
          <p className="text-3xl font-bold text-red-600">{totalDebt.toLocaleString()} ₽</p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Новая запись</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Имя клиента *</label>
              <input
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.clientName}
                onChange={e => setForm({ ...form, clientName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Сумма (₽) *</label>
              <input
                required
                type="number"
                min="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Тип</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option value="income">Оплата</option>
                <option value="debt">Задолженность</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Описание</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {/* Payments list */}
      {loading ? (
        <div className="text-gray-500">Загрузка...</div>
      ) : payments.length === 0 ? (
        <div className="text-gray-400 text-sm">Записей нет</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-400 border-b">
                <th className="px-5 py-3">Клиент</th>
                <th className="px-5 py-3">Сумма</th>
                <th className="px-5 py-3">Тип</th>
                <th className="px-5 py-3">Описание</th>
                <th className="px-5 py-3">Дата</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium">{p.clientName}</td>
                  <td className="px-5 py-4 font-semibold">
                    {p.amount.toLocaleString()} ₽
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      p.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {p.type === 'income' ? 'Оплата' : 'Долг'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-400">{p.description || '—'}</td>
                  <td className="px-5 py-4 text-gray-400">
                    {p.date?.seconds
                      ? new Date(p.date.seconds * 1000).toLocaleDateString('ru')
                      : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-red-400 hover:text-red-600 transition"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
