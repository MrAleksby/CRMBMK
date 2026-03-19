import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

const emptyForm = {
  childName: '',
  childAge: '',
  parentName: '',
  phone: '',
  email: '',
  notes: '',
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const fetchClients = async () => {
    const snap = await getDocs(collection(db, 'clients'))
    setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }

  useEffect(() => { fetchClients() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await addDoc(collection(db, 'clients'), {
        ...form,
        childAge: Number(form.childAge),
        createdAt: new Date(),
      })
      setForm(emptyForm)
      setShowForm(false)
      fetchClients()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить клиента?')) return
    await deleteDoc(doc(db, 'clients', id))
    fetchClients()
  }

  const filtered = clients.filter(c =>
    `${c.childName} ${c.parentName} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Клиенты</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition"
        >
          + Добавить клиента
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Новый клиент</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Имя ребёнка *</label>
              <input
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.childName}
                onChange={e => setForm({ ...form, childName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Возраст</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.childAge}
                onChange={e => setForm({ ...form, childAge: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Имя родителя *</label>
              <input
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.parentName}
                onChange={e => setForm({ ...form, parentName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Телефон</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Email</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Заметки</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
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

      {/* Search */}
      <input
        placeholder="Поиск по имени, телефону..."
        className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Clients list */}
      {loading ? (
        <div className="text-gray-500">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 text-sm">Клиентов нет</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-xl">
                  👶
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{c.childName}, {c.childAge} лет</p>
                  <p className="text-sm text-gray-500">Родитель: {c.parentName}</p>
                  <p className="text-sm text-gray-400">{c.phone} {c.email && `· ${c.email}`}</p>
                  {c.notes && <p className="text-xs text-gray-400 mt-1">{c.notes}</p>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-red-400 hover:text-red-600 text-sm transition"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
