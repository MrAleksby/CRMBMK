import { useEffect, useRef, useState } from 'react'
import { downloadBackup } from '../lib/backup'
import { describeError } from '../lib/withTimeout'
import { planImport, reconcileImport } from '../lib/import-alfa'
import { readDump, countExisting, clearCollections, writeImport, REPLACED, REQUIRED_FILES } from '../lib/import-alfa-run'

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

const Row = ({ label, value, color = '#111827' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' }}>
    <span style={{ color: '#4b5563' }}>{label}</span>
    <span style={{ color, fontWeight: '600' }}>{value}</span>
  </div>
)

const money = (n) => `${Math.round(n || 0).toLocaleString('ru')} сум`

export default function AlfaImportPanel() {
  const fileInput = useRef(null)
  const [dump, setDump] = useState(null)
  const [missing, setMissing] = useState([])
  const [plan, setPlan] = useState(null)
  const [check, setCheck] = useState(null)
  const [existing, setExisting] = useState(null)
  const [backedUp, setBackedUp] = useState(false)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState([])
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    countExisting().then(setExisting).catch(e => setError(describeError(e)))
  }, [])

  const handleFiles = async (event) => {
    setError(''); setPlan(null); setCheck(null); setDone(null)
    try {
      const { dump: parsed, missing: absent } = await readDump([...event.target.files])
      setDump(parsed)
      setMissing(absent)
      if (absent.length === 0) {
        const built = planImport(parsed)
        setPlan(built)
        setCheck(reconcileImport(parsed, built))
      }
    } catch (e) {
      console.error(e)
      setError(`Не удалось прочитать файлы: ${e.message}`)
    }
  }

  const handleBackup = async () => {
    try {
      await downloadBackup()
      setBackedUp(true)
    } catch (e) {
      console.error(e)
      setError('Не удалось скачать резервную копию. Без неё импорт запускать нельзя.')
    }
  }

  const handleRun = async () => {
    const total = Object.values(existing || {}).reduce((s, n) => s + n, 0)
    const warning = total > 0
      ? `Импорт заменит текущие данные.\n\nБудет удалено записей: ${total}. Затем записано ${plan.clients.length} учеников, ${plan.transactions.length} операций, ${plan.charges.length} начислений.\n\nПродолжить?`
      : `Импортировать ${plan.clients.length} учеников и всю историю?`
    if (!confirm(warning)) return

    setRunning(true); setError(''); setLog([])
    const note = (line) => setLog(prev => [...prev, line])

    try {
      await clearCollections(REPLACED, note)
      const written = await writeImport(plan, note)
      setDone(written)
      setExisting(await countExisting())
    } catch (e) {
      console.error(e)
      setError(describeError(e))
    } finally {
      setRunning(false)
    }
  }

  const existingTotal = existing ? Object.values(existing).reduce((s, n) => s + n, 0) : 0
  const ready = plan && check?.ok && backedUp && !running

  return (
    <div style={card}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 6px' }}>
        Импорт истории из AlfaCRM
      </h3>
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
        Выгрузите данные скриптом <code>scripts/alfacrm-export.mjs</code>, затем выберите все файлы
        из папки <code>data/alfacrm</code>. Импорт заменит текущих учеников, занятия и финансы.
      </p>

      {error && (
        <p style={{
          background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
          borderRadius: '10px', padding: '10px 12px', fontSize: '13px', marginBottom: '14px',
        }}>⚠️ {error}</p>
      )}

      {existing && existingTotal > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: '#b45309', margin: '0 0 6px', fontWeight: '600' }}>
            В базе уже есть данные — импорт их заменит
          </p>
          <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
            {REPLACED.filter(n => existing[n] > 0).map(n => `${n}: ${existing[n]}`).join(' · ')}
          </p>
        </div>
      )}

      <input ref={fileInput} type="file" multiple accept=".json" onChange={handleFiles}
        style={{ display: 'none' }} />
      <button onClick={() => fileInput.current?.click()} style={ghostBtn} disabled={running}>
        📁 Выбрать файлы выгрузки
      </button>

      {dump && missing.length > 0 && (
        <p style={{ fontSize: '13px', color: '#b91c1c', marginTop: '12px' }}>
          ⚠️ Не хватает файлов: {missing.join(', ')}
        </p>
      )}

      {plan && check && (
        <>
          <div style={{ background: '#f7f8fa', borderRadius: '12px', padding: '12px', margin: '16px 0' }}>
            <Row label="Учеников" value={plan.clients.length} />
            <Row label="Лидов в воронке" value={plan.leads.length} />
            <Row label="Занятий" value={plan.lessons.length} />
            <Row label="Начислений за занятия" value={plan.charges.length} />
            <Row label="Кассовых операций" value={plan.transactions.length} />
            <Row label="Абонементов" value={plan.subscriptions.length} />
            <Row label="Справочники" value={`${plan.accounts.length} касс · ${plan.categories.length} статей · ${plan.teachers.length} педагогов · ${plan.packages.length} пакетов`} />
          </div>

          <div style={{
            background: check.ok ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${check.ok ? '#dcfce7' : '#fee2e2'}`,
            borderRadius: '12px', padding: '12px', marginBottom: '16px',
          }}>
            <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 8px', color: check.ok ? '#059669' : '#b91c1c' }}>
              {check.ok ? '✓ Сверка с AlfaCRM пройдена' : '⚠️ Данные не сходятся с AlfaCRM'}
            </p>
            <Row label="Балансы учеников совпали"
              value={`${check.clients.matched} из ${check.clients.total}`}
              color={check.clients.matched === check.clients.total ? '#059669' : '#dc2626'} />
            <Row label="Сумма доходов"
              value={`${money(check.income.expected)} → ${money(check.income.actual)}`}
              color={check.income.ok ? '#059669' : '#dc2626'} />
            {check.clients.mismatched.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                {check.clients.mismatched.map(m => (
                  <p key={m.id} style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                    {m.name}: у нас {money(m.наш)}, в AlfaCRM {money(m.альфа)}
                  </p>
                ))}
              </div>
            )}
          </div>

          {!check.ok && (
            <p style={{ fontSize: '13px', color: '#b91c1c', marginBottom: '12px' }}>
              Импорт заблокирован: сначала нужно понять, откуда расхождение.
            </p>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={handleBackup} style={ghostBtn} disabled={running}>
              💾 {backedUp ? 'Копия скачана' : 'Сначала скачать копию'}
            </button>
            <button onClick={handleRun} disabled={!ready}
              style={{ ...btn('#dc2626'), opacity: ready ? 1 : 0.5, cursor: ready ? 'pointer' : 'not-allowed' }}>
              {running ? 'Импортируем...' : 'Заменить данные и импортировать'}
            </button>
          </div>
          {!backedUp && (
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
              Кнопка импорта включится после скачивания резервной копии.
            </p>
          )}
        </>
      )}

      {log.length > 0 && (
        <div style={{ marginTop: '16px', background: '#f7f8fa', borderRadius: '12px', padding: '12px' }}>
          {log.map((line, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#4b5563', margin: 0, fontFamily: 'monospace' }}>{line}</p>
          ))}
        </div>
      )}

      {done && (
        <div style={{ marginTop: '16px', background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '12px', padding: '12px' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#059669', margin: '0 0 6px' }}>
            ✓ Импорт завершён
          </p>
          <p style={{ fontSize: '13px', color: '#4b5563', margin: 0 }}>
            Данные совпадают с AlfaCRM. Проверьте балансы на странице «Клиенты».
          </p>
        </div>
      )}
    </div>
  )
}
