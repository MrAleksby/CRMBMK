import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { describeError } from '../lib/withTimeout'
import { toAmount } from '../lib/amount'
import { bonusRules, DEFAULT_RULES } from '../lib/bonus'
import ErrorBanner from './ErrorBanner'

// Сколько начислять за приглашённого. Один документ `bonusRules/current`:
// справочника из одной строки не нужно, а суммы владелец меняет редко.
//
// Уже начисленные бонусы правило не пересчитывает: каждая запись — снимок
// правила на момент начисления, как и цена в выданном абонементе. Иначе
// поднятие суммы задним числом переписало бы все прошлые бонусы.
const input = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none', width: '160px',
}

const label = { fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }

export default function BonusPanel() {
  const [form, setForm] = useState(DEFAULT_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setError('')
    try {
      const snap = await getDoc(doc(db, 'bonusRules', 'current'))
      setForm(bonusRules(snap.exists() ? snap.data() : null))
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    const trial = toAmount(form.trial)
    const visit = toAmount(form.visit)
    if (trial === null || visit === null) return setError('Суммы — неотрицательные числа')

    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, 'bonusRules', 'current'), { trial, visit })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ color: '#6b7280', fontSize: '13px' }}>Загрузка...</p>

  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '20px',
    }}>
      <ErrorBanner message={error} onRetry={load} />

      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', margin: '0 0 6px' }}>
        Бонусы за приглашённых
      </h3>
      <p style={{ fontSize: '13px', color: '#4b5563', margin: '0 0 14px', maxWidth: '620px' }}>
        Привёл новичка — после его первого проведённого занятия пригласившему падает
        первая сумма, за каждое следующее посещение вторая. Бонусы идут на семью,
        если она есть. Потратить их можно скидкой при списании за занятие
        и при выдаче абонемента.
      </p>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <label style={label}>За пробное приглашённого</label>
          <input style={input} inputMode="decimal" value={form.trial}
            onChange={e => setForm({ ...form, trial: e.target.value })} />
        </div>
        <div>
          <label style={label}>За каждое посещение</label>
          <input style={input} inputMode="decimal" value={form.visit}
            onChange={e => setForm({ ...form, visit: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
        <button onClick={handleSave} disabled={saving} style={{
          background: '#7c3aed', color: '#fff', border: 'none', padding: '9px 16px',
          borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>Сохранить</button>
       {saved && <span style={{ fontSize: '13px', color: '#059669' }}>Сохранено</span>}
      </div>

      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
        Новые суммы действуют вперёд. Уже начисленные бонусы не пересчитываются:
        каждый из них — снимок правила на день начисления.
      </p>
    </div>
  )
}
