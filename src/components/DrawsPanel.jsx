import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, addDoc, doc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { invalidate } from '../lib/store'
import { DRAW_CATEGORY_NAMES } from '../lib/directories'
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

const selectStyle = {
  border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', color: '#111827', background: '#fff',
}

// Переразметка старых «зарплат себе» в изъятия. Работает один раз и вручную:
// система не угадывает по комментарию, кто именно забрал деньги, — отмечает владелец.
export default function DrawsPanel() {
  const [transactions, setTransactions] = useState([])
  const [teachers, setTeachers] = useState([])
  const [categories, setCategories] = useState([])
  const [checked, setChecked] = useState(() => new Set())
  // Статью выбирают явно: молчаливый дефолт свалил бы все траты в одну кучу.
  const [category, setCategory] = useState('')
  // Изъятия прячутся и среди выплат без комментария — их тоже надо перебрать,
  // поэтому фильтры, а не жёсткое правило «только с комментарием».
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterComment, setFilterComment] = useState('any')
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

  const candidates = useMemo(
    () => drawCandidates(transactions, { teacherId: filterTeacher, comment: filterComment }),
    [transactions, filterTeacher, filterComment])
  const selected = useMemo(
    () => candidates.filter(t => checked.has(t.id)), [candidates, checked])

  const candidatesSum = useMemo(() => drawSum(candidates), [candidates])

  const drawCategories = useMemo(() => categories.filter(c => c.kind === 'draw'), [categories])

  // В списке — и заведённые статьи, и заготовки: заготовка создастся при переводе.
  const categoryOptions = useMemo(() => {
    const names = new Set([...DRAW_CATEGORY_NAMES, ...drawCategories.map(c => c.name)])
    return [...names]
  }, [drawCategories])

  const teacherName = (id) => teachers.find(t => t.id === id)?.name || '—'

  const toggle = (id) => setChecked(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAll = () => setChecked(prev =>
    prev.size === candidates.length ? new Set() : new Set(candidates.map(t => t.id)))

  // Статьи изъятий в старой базе не заведены. Создаём выбранную на лету:
  // операция без статьи не сохраняется.
  const ensureCategory = async (name) => {
    const existing = drawCategories.find(c => c.name === name)
    if (existing) return existing.id
    const ref = await addDoc(collection(db, 'categories'), { name, kind: 'draw', order: 99 })
    return ref.id
  }

  const handleConvert = async () => {
    if (!selected.length || !category || saving) return
    setSaving(true)
    setError('')
    try {
      const categoryId = await ensureCategory(category)
      const batch = writeBatch(db)
      for (const t of selected) batch.update(doc(db, 'transactions', t.id), toDrawDoc(categoryId))
      await batch.commit()

      invalidate()
      setDone(`Переведено в изъятия по статье «${category}»: ${selected.length} ` +
        `на ${money(drawSum(selected))}. Прибыль в отчётах выросла на эту сумму, ` +
        'остатки по кассам не изменились.')
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
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 12px', lineHeight: 1.5 }}>
        Личные траты владельца раньше проводили как выплату ЗП — и они занижали прибыль,
        будто школа их потратила. Отберите фильтрами (получатель, есть ли комментарий),
        отметьте выплаты одного вида, выберите статью и переведите; затем следующие.
        Из зарплат они уйдут, но в кассе останутся — деньги ведь потрачены. Дальше такие
        операции сразу заводите видом «Изъятие».
      </p>

      {/* Фильтры. Без них выплаты без комментария невозможно отделить от зарплат
          педагогам: в списке 200+ строк, и глазами их не перебрать. */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <select value={filterTeacher} style={selectStyle}
          onChange={e => { setFilterTeacher(e.target.value); setChecked(new Set()) }}>
          <option value="">Все получатели</option>
          <option value="none">Без получателя</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select value={filterComment} style={selectStyle}
          onChange={e => { setFilterComment(e.target.value); setChecked(new Set()) }}>
          <option value="any">Комментарий: любой</option>
          <option value="with">Только с комментарием</option>
          <option value="without">Только без комментария</option>
        </select>

        <span style={{ fontSize: '12px', color: '#6b7280', alignSelf: 'center' }}>
          Найдено {candidates.length} на {money(candidatesSum)}
        </span>
      </div>

      <ErrorBanner message={error} onRetry={fetchAll} />

      {done && (
        <p style={{
          fontSize: '13px', color: '#059669', background: '#f0fdf4',
          border: '1px solid #dcfce7', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px',
        }}>{done}</p>
      )}

      {candidates.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          Выплат ЗП под эти фильтры нет — переразмечать нечего.
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Статья изъятия: на что ушли деньги. Прибыль от неё не зависит,
                  но по статьям видно структуру личных трат. */}
              <select value={category} onChange={e => setCategory(e.target.value)} style={{
                border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 10px',
                fontSize: '13px', color: '#111827', background: '#fff',
              }}>
                <option value="">Статья изъятия…</option>
                {categoryOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>

              <button onClick={handleConvert} disabled={!selected.length || !category || saving} style={{
                background: selected.length && category ? '#7c3aed' : '#e5e7eb',
                color: selected.length && category ? '#fff' : '#6b7280',
                border: 'none', padding: '8px 16px', borderRadius: '10px',
                fontSize: '13px', fontWeight: '600',
                cursor: selected.length && category && !saving ? 'pointer' : 'default',
              }}>
                {saving ? 'Переводим…'
                  : selected.length
                    ? `Перевести: ${selected.length} на ${money(drawSum(selected))}`
                    : 'Перевести в изъятия'}
              </button>
            </div>
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
