import { useEffect, useState } from 'react'
import { TX_KINDS, KIND_INCOME, KIND_SALARY, KIND_REFUND } from '../lib/finance'
import { emptyTransactionForm, categoriesForKind, validateTransactionForm, suggestPayer } from '../lib/transaction'

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '8px 12px', color: '#111827', fontSize: '14px', outline: 'none', width: '100%',
}

const labelStyle = { fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }

// Форма открывается поверх таблицы, как в AlfaCRM. Иначе при прокрутке к нужной
// строке форма появляется где-то вверху страницы, и кажется, что кнопка не сработала.
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.45)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '40px 16px', zIndex: 100, overflowY: 'auto',
}

const card = {
  background: '#ffffff', border: '1px solid #e5e7eb',
  borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '760px',
}

const header = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: '16px',
}

const closeBtn = {
  background: 'transparent', border: 'none', color: '#9ca3af',
  fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '4px 8px',
}

export default function TransactionForm({
  accounts, categories, clients = [], teachers = [], saving, initial, onSubmit, onCancel,
}) {
  const [form, setForm] = useState(() => initial ?? emptyTransactionForm())
  const [error, setError] = useState('')
  const editing = !!initial

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  // Смена типа операции обнуляет статью: она принадлежит своему типу.
  const setKind = (kind) => setForm({ ...form, kind, categoryId: '' })

  // Выбор ученика подсказывает плательщика — обычно платит мама.
  const setClient = (e) => {
    const clientId = e.target.value
    const payer = suggestPayer(clients.find(c => c.id === clientId))
    setForm({ ...form, clientId, payerName: payer || form.payerName })
  }

  const activeAccounts = accounts.filter(a => a.active !== false)
  const kindCategories = categoriesForKind(categories, form.kind)

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateTransactionForm(form)
    if (problem) return setError(problem)
    setError('')
    onSubmit(form)
  }

  // Escape закрывает форму — привычнее, чем искать кнопку «Отмена».
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  if (activeAccounts.length === 0 || categories.length === 0) {
    return (
      <div style={overlay} onClick={onCancel}>
        <div style={card} onClick={e => e.stopPropagation()}>
          <div style={header}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>Новая операция</h3>
            <button type="button" onClick={onCancel} style={closeBtn}>✕</button>
          </div>
          <p style={{ fontSize: '14px', color: '#4b5563', margin: 0 }}>
            Сначала заведите кассы и статьи в Настройках — без них операцию не провести.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={overlay} onClick={onCancel}>
    <form onSubmit={handleSubmit} style={card} onClick={e => e.stopPropagation()}>
      <div style={header}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
          {editing ? 'Править операцию' : 'Новая операция'}
        </h3>
        <button type="button" onClick={onCancel} style={closeBtn} title="Закрыть (Esc)">✕</button>
      </div>

      {/* Тип операции */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {TX_KINDS.map(k => {
          const active = form.kind === k.value
          return (
            <button key={k.value} type="button" onClick={() => setKind(k.value)} style={{
              background: active ? '#ede9fe' : 'transparent',
              color: active ? '#7c3aed' : '#4b5563',
              border: `1px solid ${active ? '#ddd6fe' : '#e5e7eb'}`,
              padding: '8px 14px', borderRadius: '10px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}>{k.icon} {k.label}</button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Сумма (сум) *</label>
          <input required type="number" min="0" inputMode="numeric" placeholder="0" style={inputStyle}
            value={form.amount} onChange={set('amount')} />
        </div>

        <div>
          <label style={labelStyle}>Дата *</label>
          <input required type="date" style={inputStyle} value={form.date} onChange={set('date')} />
        </div>

        <div>
          <label style={labelStyle}>Касса *</label>
          <select required style={inputStyle} value={form.accountId} onChange={set('accountId')}>
            <option value="">Выберите…</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Статья *</label>
          <select required style={inputStyle} value={form.categoryId} onChange={set('categoryId')}>
            <option value="">Выберите…</option>
            {kindCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {(form.kind === KIND_INCOME || form.kind === KIND_REFUND) && (
          <>
            <div>
              <label style={labelStyle}>Ученик {form.kind === KIND_REFUND && '*'}</label>
              <select style={inputStyle} value={form.clientId} onChange={setClient}
                required={form.kind === KIND_REFUND}>
                <option value="">{form.kind === KIND_REFUND ? 'Выберите…' : 'Не привязан'}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.childName}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{form.kind === KIND_REFUND ? 'Получатель' : 'Плательщик'}</label>
              <input style={inputStyle}
                placeholder={form.kind === KIND_REFUND ? 'Кому вернули' : 'Кто внёс деньги'}
                value={form.payerName} onChange={set('payerName')} />
            </div>
          </>
        )}

        {form.kind === KIND_SALARY && (
          <div>
            <label style={labelStyle}>Педагог *</label>
            <select required style={inputStyle} value={form.teacherId} onChange={set('teacherId')}>
              <option value="">Выберите…</option>
              {teachers.filter(t => t.active !== false).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>Комментарий</label>
          <input placeholder="Необязательно" style={inputStyle}
            value={form.comment} onChange={set('comment')} />
        </div>
      </div>

      {form.kind === KIND_INCOME && !form.clientId && (
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
          Доход без ученика не влияет на его баланс — так проводят кешбеки и турниры.
        </p>
      )}

      {form.kind === KIND_REFUND && (
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
          Возврат уменьшает и кассу, и предоплату ученика.
        </p>
      )}

      {kindCategories.length === 0 && (
        <p style={{ fontSize: '12px', color: '#b91c1c', marginTop: '10px' }}>
          ⚠️ Для этого типа операции нет статей. Заведите их в Настройках.
        </p>
      )}

      {error && (
        <p style={{ fontSize: '13px', color: '#b91c1c', marginTop: '10px' }}>⚠️ {error}</p>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
        <button type="submit" disabled={saving} style={{
          background: '#7c3aed', color: '#fff', border: 'none',
          padding: '10px 20px', borderRadius: '10px', fontSize: '14px',
          fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Сохраняем...' : editing ? 'Сохранить изменения' : 'Сохранить'}</button>
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
          padding: '10px 16px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer',
        }}>Отмена</button>
      </div>
    </form>
    </div>
  )
}
