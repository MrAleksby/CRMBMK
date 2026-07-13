import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { invalidate } from '../lib/store'
import { transferPairs, toTransferDoc, pairsSum } from '../lib/transfers'
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

const th = {
  textAlign: 'left', padding: '8px 10px', color: '#6b7280',
  fontSize: '11px', fontWeight: '600', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
}

// Сведение старых переводов между кассами: пара «расход + доход» → одна операция.
// Пары только предлагаются: одинаковая сумма в один день бывает и совпадением.
export default function TransfersPanel() {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [checked, setChecked] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const fetchAll = async () => {
    setError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const [tx, acc] = await Promise.all([
        getDocs(collection(db, 'transactions')),
        getDocs(collection(db, 'accounts')),
      ])
      setTransactions(tx.docs.map(d => ({ id: d.id, ...d.data() })))
      setAccounts(acc.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const pairs = useMemo(() => transferPairs(transactions), [transactions])
  const selected = useMemo(
    () => pairs.filter(p => checked.has(p.expense.id)), [pairs, checked])

  const accountName = (id) => accounts.find(a => a.id === id)?.name || '—'

  const toggle = (id) => setChecked(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAll = () => setChecked(prev =>
    prev.size === pairs.length ? new Set() : new Set(pairs.map(p => p.expense.id)))

  // Расход превращаем в перевод, парный доход удаляем — одной транзакцией.
  // Если удалить доход, а расход не переписать, деньги пропадут из кассы.
  const handleMerge = async () => {
    if (!selected.length || saving) return
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      for (const pair of selected) {
        batch.update(doc(db, 'transactions', pair.expense.id), toTransferDoc(pair))
        batch.delete(doc(db, 'transactions', pair.income.id))
      }
      await batch.commit()

      invalidate()
      setDone(`Сведено переводов: ${selected.length} на ${money(pairsSum(selected))}. ` +
        'Остатки по кассам не изменились, но доходы и расходы больше не раздуты.')
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
        <Icon name="arrowRight" size={16} style={{ color: '#4b5563' }} />Переводы между кассами
      </h3>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 16px', lineHeight: 1.5 }}>
        Раньше перевод с расчётного счёта на карту заводили двумя операциями — расходом
        и доходом, — и обе попадали в отчёт: школа будто зарабатывала и тратила деньги,
        которые просто сменили карман. Ниже — подходящие пары (одна сумма, один день,
        разные кассы). Отметьте настоящие переводы: пара станет одной операцией «Перевод».
        Остатки по кассам не изменятся. Впредь заводите вид «Перевод между кассами».
      </p>

      <ErrorBanner message={error} onRetry={fetchAll} />

      {done && (
        <p style={{
          fontSize: '13px', color: '#059669', background: '#f0fdf4',
          border: '1px solid #dcfce7', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px',
        }}>{done}</p>
      )}

      {pairs.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          Парных операций не найдено — сводить нечего.
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
              {checked.size === pairs.length ? 'Снять всё' : `Отметить все (${pairs.length})`}
            </button>

            <button onClick={handleMerge} disabled={!selected.length || saving} style={{
              background: selected.length ? '#7c3aed' : '#e5e7eb',
              color: selected.length ? '#fff' : '#6b7280',
              border: 'none', padding: '8px 16px', borderRadius: '10px',
              fontSize: '13px', fontWeight: '600',
              cursor: selected.length && !saving ? 'pointer' : 'default',
            }}>
              {saving ? 'Сводим…'
                : selected.length
                  ? `Свести в перевод: ${selected.length} на ${money(pairsSum(selected))}`
                  : 'Свести в перевод'}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={th} />
                  <th style={th}>Дата</th>
                  <th style={{ ...th, textAlign: 'right' }}>Сумма</th>
                  <th style={th}>Откуда → куда</th>
                  <th style={th}>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair, i) => {
                  const id = pair.expense.id
                  const last = i === pairs.length - 1
                  const border = last ? 'none' : '1px solid #f3f4f6'
                  const date = toJsDate(pair.expense.date)
                  const comment = pair.expense.comment || pair.income.comment || '—'

                  return (
                    <tr key={id} style={{ background: checked.has(id) ? '#faf5ff' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', borderBottom: border }}>
                        <input type="checkbox" checked={checked.has(id)} onChange={() => toggle(id)} />
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: border, whiteSpace: 'nowrap', color: '#4b5563' }}>
                        {date ? date.toLocaleDateString('ru') : '—'}
                      </td>
                      <td style={{
                        padding: '8px 10px', borderBottom: border, whiteSpace: 'nowrap',
                        textAlign: 'right', fontWeight: '600', color: '#111827',
                      }}>
                        {money(pair.amount)}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: border, color: '#4b5563', whiteSpace: 'nowrap' }}>
                        {accountName(pair.expense.accountId)}
                        <span style={{ color: '#9ca3af' }}> → </span>
                        {accountName(pair.income.accountId)}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: border, color: '#111827' }}>
                        {comment}
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
