import { useEffect, useState } from 'react'
import { downloadBackup } from '../lib/backup'
import { describeError } from '../lib/withTimeout'
import { missingCategories, incomeCategoryMissing, planMigration, reconcile } from '../lib/migrate'
import { loadMigrationState, createCategories, applyMigration } from '../lib/migrate-run'

const card = {
  background: '#ffffff', border: '1px solid #e5e7eb',
  borderRadius: '16px', padding: '20px',
}

const btn = (color = '#7c3aed') => ({
  background: color, color: '#fff', border: 'none', padding: '10px 18px',
  borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
})

const ghostBtn = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  padding: '10px 16px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer',
}

const money = (n) => `${(n || 0).toLocaleString()} сум`

const Row = ({ label, value, color = '#111827' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' }}>
    <span style={{ color: '#4b5563' }}>{label}</span>
    <span style={{ color, fontWeight: '600' }}>{value}</span>
  </div>
)

export default function MigrationPanel() {
  const [state, setState] = useState(null)
  const [accountId, setAccountId] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [backedUp, setBackedUp] = useState(false)

  const load = async () => {
    setError('')
    try {
      const data = await loadMigrationState()
      setState(data)
      setAccountId(prev => prev || data.accounts[0]?.id || '')
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleBackup = async () => {
    try {
      await downloadBackup()
      setBackedUp(true)
    } catch (e) {
      console.error(e)
      setError('Не удалось скачать резервную копию. Без неё миграцию запускать нельзя.')
    }
  }

  const handleRun = async () => {
    if (!accountId) return setError('Выберите кассу для исторических операций')
    if (!confirm('Перенести старые платежи и расходы в новую модель?\n\nСтарые коллекции останутся нетронутыми.')) return

    setRunning(true)
    setError('')
    try {
      const specs = [
        ...incomeCategoryMissing(state.payments, state.categories),
        ...missingCategories(state.expenses, state.categories),
      ]
      const categories = await createCategories(specs, state.categories)

      const plan = planMigration({
        payments: state.payments,
        expenses: state.expenses,
        categories,
        accountId,
        done: state.done,
      })

      await applyMigration(plan)

      // Сверяем по тому, что реально легло в базу, а не по плану:
      // так проверка ловит и записи, не прошедшие валидацию правил.
      const fresh = await loadMigrationState()
      const check = reconcile(
        { payments: fresh.payments, expenses: fresh.expenses },
        { transactions: fresh.transactions, charges: fresh.charges },
      )

      setResult({
        created: { transactions: plan.transactions.length, charges: plan.charges.length },
        skipped: plan.skipped,
        check,
        newCategories: specs.map(s => s.name),
      })
      setState(fresh)
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <div style={{ ...card, color: '#6b7280', fontSize: '14px' }}>Загрузка...</div>

  const pending = state.payments.filter(p => !state.done.includes(`payments/${p.id}`)).length
    + state.expenses.filter(e => !state.done.includes(`expenses/${e.id}`)).length

  const nothingToDo = state.payments.length === 0 && state.expenses.length === 0

  return (
    <div style={card}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 6px' }}>
        Перенос финансов в новую модель
      </h3>
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
        Оплаты уезжают в кассовые операции, списания за занятия — на лицевые счета учеников.
        Старые коллекции остаются нетронутыми, пока вы не сверите суммы.
      </p>

      {error && (
        <p style={{
          background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
          borderRadius: '10px', padding: '10px 12px', fontSize: '13px', marginBottom: '14px',
        }}>⚠️ {error}</p>
      )}

      {nothingToDo ? (
        <p style={{ fontSize: '13px', color: '#4b5563', margin: 0 }}>
          Старых записей нет — переносить нечего.
        </p>
      ) : (
        <>
          <div style={{ background: '#f7f8fa', borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
            <Row label="Платежей в старой модели" value={state.payments.length} />
            <Row label="Расходов в старой модели" value={state.expenses.length} />
            <Row label="Уже перенесено" value={state.done.length} color="#059669" />
            <Row label="Осталось перенести" value={pending} color={pending > 0 ? '#7c3aed' : '#6b7280'} />
          </div>

          {pending > 0 && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  Касса для исторических операций *
                </label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{
                  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
                  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none', width: '260px',
                }}>
                  {state.accounts.length === 0 && <option value="">Кассы не заведены</option>}
                  {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  У старых записей кассы не было. Всю историю отнесём в выбранную.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={handleBackup} style={ghostBtn}>
                  💾 {backedUp ? 'Копия скачана' : 'Сначала скачать копию'}
                </button>
                <button onClick={handleRun} disabled={running || !backedUp || !accountId}
                  style={{ ...btn(), opacity: (running || !backedUp || !accountId) ? 0.5 : 1 }}>
                  {running ? 'Переносим...' : `Перенести ${pending} записей`}
                </button>
              </div>
              {!backedUp && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                  Кнопка переноса включится после скачивания резервной копии.
                </p>
              )}
            </>
          )}
        </>
      )}

      {result && (
        <div style={{
          marginTop: '16px', padding: '12px',
          background: result.check.ok ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${result.check.ok ? '#dcfce7' : '#fee2e2'}`,
          borderRadius: '12px',
        }}>
          <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 8px', color: result.check.ok ? '#059669' : '#b91c1c' }}>
            {result.check.ok ? '✓ Перенос завершён, суммы сошлись' : '⚠️ Перенос завершён, но суммы разошлись'}
          </p>
          <Row label="Создано операций" value={result.created.transactions} />
          <Row label="Создано начислений" value={result.created.charges} />
          {result.newCategories.length > 0 && (
            <Row label="Добавлено статей" value={result.newCategories.join(', ')} />
          )}
          <div style={{ height: '8px' }} />
          <Row label="Оплаты: было → стало"
            value={`${money(result.check.before.income)} → ${money(result.check.after.income)}`}
            color={result.check.before.income === result.check.after.income ? '#059669' : '#dc2626'} />
          <Row label="Списания: было → стало"
            value={`${money(result.check.before.sessions)} → ${money(result.check.after.sessions)}`}
            color={result.check.before.sessions === result.check.after.sessions ? '#059669' : '#dc2626'} />
          <Row label="Расходы: было → стало"
            value={`${money(result.check.before.expenses)} → ${money(result.check.after.expenses)}`}
            color={result.check.before.expenses === result.check.after.expenses ? '#059669' : '#dc2626'} />

          {result.skipped.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <p style={{ fontSize: '13px', color: '#b91c1c', marginBottom: '4px' }}>
                Пропущено записей: {result.skipped.length}
              </p>
              {result.skipped.slice(0, 5).map(s => (
                <p key={s.source} style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                  {s.source} — {s.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
