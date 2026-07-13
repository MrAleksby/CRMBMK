import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, addDoc, doc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { invalidate } from '../lib/store'
import { DRAW_CATEGORY } from '../lib/directories'
import { drawCandidates, toDrawDoc, drawSum } from '../lib/draws'
import { toJsDate } from '../lib/finance'
import ErrorBanner from './ErrorBanner'
import Icon from './Icon'

const card = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '20px',
}

const money = (value) => `${(value || 0).toLocaleString()} сум`

// Переразметка старых «зарплат себе» в изъятия. Работает один раз и вручную:
// система не угадывает по комментарию, кто именно забрал деньги, — отмечает владелец.
export default function DrawsPanel() {
  const [transactions, setTransactions] = useState([])
  const [teachers, setTeachers] = useState([])
  const [categories, setCategories] = useState([])
  const [checked, setChecked] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const fetchAll = async () => {
    setError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [tx, ts, cs] = await Promise.all([
        getDocs(collection(db, 'transactions')),
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'categories')),
      ])
      setTransactions(tx.docs.map(d => ({ id: d.id, ...d.data() })))
      setTeachers(ts.docs.map(d => ({ id: d.id, ...d.data() })))
      setCategories(cs.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const candidates = useMemo(() => drawCandidates(transactions), [transactions])
  const selected = useMemo(
    () => candidates.filter(t => checked.has(t.id)), [candidates, checked])

  const teacherName = (id) => teachers.find(t => t.id === id)?.name || '—'

  const toggle = (id) => setChecked(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAll = () => setChecked(prev =>
    prev.size === candidates.length ? new Set() : new Set(candidates.map(t => t.id)))

  // Статья «Изъятие владельца» может быть не заведена — старые базы её не знают.
  // Заводим на лету: операция без статьи не сохраняется.
  const ensureDrawCategory = async () => {
    const existing = categories.find(c => c.kind === DRAW_CATEGORY.kind)
    if (existing) return existing.id
    const ref = await addDoc(collection(db, 'categories'), { ...DRAW_CATEGORY, order: 99 })
    return ref.id
  }

  const handleConvert = async () => {
    if (!selected.length || saving) return
    setSaving(true)
    setError('')
    try {
      const categoryId = await ensureDrawCategory()
      const batch = writeBatch(db)
      for (const t of selected) batch.update(doc(db, 'transactions', t.id), toDrawDoc(categoryId))
      await batch.commit()

      invalidate()
      setDone(`Переведено в изъятия: ${selected.length} на ${money(drawSum(selected))}. ` +
        'Прибыль в отчётах выросла на эту сумму, остатки по кассам не изменились.')
      setChecked(new Set())
      await fetchAll()
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: '#6b7280', padding: '32px' }}>Загрузка...</div>

  return (
    <div style={card}>
      <h3 style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0,
      }}>
        <Icon name="logout" size={16} style={{ color: '#b45309' }} />Изъятия владельца
      </h3>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 16px', lineHeight: 1.5 }}>
        Личные траты владельца раньше проводили как «Выплату ЗП» с комментарием — и они
        занижали прибыль, будто школа их потратила. Отметьте те выплаты, которые были
        изъятиями: они уйдут из зарплат, но останутся в кассе — деньги ведь ушли.
        Дальше такие операции заводите видом «Изъятие» сразу.
      </p>

      <ErrorBanner message={error} onRetry={fetchAll} />

      {done && (
        <p style={{
          fontSize: '13px', color: '#059669', background: '#f0fdf4',
          border: '1px solid #dcfce7', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px',
        }}>{done}</p>
      )}

      {candidates.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          Выплат ЗП с комментарием не осталось — переразмечать нечего.
        </p>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', marginBottom: '12px', flexWrap: 'wrap',
          }}>
            <button onClick={toggleAll} style={{
              background: 'transparent', color: '#4b5563', border: '1px solid #e5e7eb',
              padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
            }}>
              {checked.size === candidates.length ? 'Снять всё' : `Отметить все (${candidates.length})`}
            </button>

            <button onClick={handleConvert} disabled={!selected.length || saving} style={{
              background: selected.length ? '#7c3aed' : '#e5e7eb',
              color: selected.length ? '#fff' : '#6b7280',
              border: 'none', padding: '8px 16px', borderRadius: '10px',
              fontSize: '13px', fontWeight: '600',
              cursor: selected.length && !saving ? 'pointer' : 'default',
            }}>
              {saving ? 'Переводим…'
                : selected.length
                  ? `Перевести в изъятия: ${selected.length} на ${money(drawSum(selected))}`
                  : 'Перевести в изъятия'}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['', 'Дата', 'Сумма', 'Получатель', 'Комментарий'].map((label, i) => (
                    <th key={i} style={{
                      textAlign: i === 2 ? 'right' : 'left', padding: '8px 10px', color: '#6b7280',
                      fontSize: '11px', fontWeight: '600', borderBottom: '1px solid #e5e7eb',
                      whiteSpace: 'nowrap',
                    }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((t, i) => {
                  const last = i === candidates.length - 1
                  const border = last ? 'none' : '1px solid #f3f4f6'
                  const date = toJsDate(t.date)
                  return (
                    <tr key={t.id} style={{ background: checked.has(t.id) ? '#faf5ff' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', borderBottom: border }}>
                        <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggle(t.id)} />
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: border, whiteSpace: 'nowrap', color: '#4b5563' }}>
                        {date ? date.toLocaleDateString('ru') : '—'}
                      </td>
                      <td style={{
                        padding: '8px 10px', borderBottom: border, whiteSpace: 'nowrap',
                        textAlign: 'right', fontWeight: '600', color: '#dc2626',
                      }}>
                        {money(t.amount)}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: border, color: '#4b5563' }}>
                        {teacherName(t.teacherId)}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: border, color: '#111827' }}>
                        {t.comment}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
