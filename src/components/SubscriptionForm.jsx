import { useState } from 'react'
import { perLessonPrice } from '../lib/directories'
import {
  emptySubscriptionForm, validateSubscriptionForm,
  endDateFromWeeks, weeksBetween,
} from '../lib/subscription'

const inputStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
  padding: '6px 8px', color: '#111827', fontSize: '13px', outline: 'none', width: '100%',
}

const labelStyle = { fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }

export default function SubscriptionForm({
  initial, packages, accounts = [], incomeCategories = [], saving, onSubmit, onCancel,
}) {
  const [form, setForm] = useState(initial || emptySubscriptionForm)
  const [error, setError] = useState('')
  const editing = Boolean(initial)
  // Оплата — только при выдаче нового абонемента. При правке деньги уже проведены.
  const withPayment = !editing

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  // Срок в неделях и дата окончания — одно и то же, записанное по-разному.
  // Правишь одно — второе пересчитывается, как в AlfaCRM.
  const setWeeks = (e) => {
    const weeks = e.target.value
    setForm({ ...form, weeks, endDate: endDateFromWeeks(form.startDate, weeks) })
  }
  const setEndDate = (e) => {
    const endDate = e.target.value
    setForm({ ...form, endDate, weeks: String(weeksBetween(form.startDate, endDate) || '') })
  }
  const setStartDate = (e) => {
    const startDate = e.target.value
    setForm({ ...form, startDate, endDate: endDateFromWeeks(startDate, form.weeks) || form.endDate })
  }

  // Архивный тариф остаётся в списке, если этот абонемент уже на нём выдан:
  // иначе при правке сроков молча слетел бы пакет.
  const chosen = packages.find(p => p.id === form.packageId)
  const options = packages.filter(p => p.active !== false || p.id === form.packageId)
  const price = chosen ? perLessonPrice(chosen) : null

  // При выборе пакета подставляем его цену в сумму оплаты. Менеджер может
  // переписать — скидка, доплата, оплата частями, — но по умолчанию платят
  // полную стоимость пакета.
  const setPackage = (e) => {
    const packageId = e.target.value
    const pkg = packages.find(p => p.id === packageId)
    setForm({
      ...form, packageId,
      payAmount: withPayment && pkg ? String(Number(pkg.price) || '') : form.payAmount,
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const problem = validateSubscriptionForm(form, packages, withPayment)
    if (problem) return setError(problem)
    setError('')
    onSubmit(form, chosen)
  }

  if (options.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: '#6b7280' }}>
        Сначала заведите абонементы в Настройках.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#f7f8fa', border: '1px solid #e5e7eb',
      borderRadius: '10px', padding: '10px', marginTop: '8px',
    }}>
      <div style={{ marginBottom: '8px' }}>
        <label style={labelStyle}>Абонемент</label>
        <select required style={inputStyle} value={form.packageId} onChange={setPackage}>
          <option value="">Выберите…</option>
         {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

     {chosen && (
        <p style={{ fontSize: '11px', color: '#4b5563', marginBottom: '8px' }}>
         {chosen.lessonsCount} уроков · {Number(chosen.price).toLocaleString()} сум
         {price !== null && <> · <b>{price.toLocaleString()} сум за урок</b></>}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <div>
          <label style={labelStyle}>Начало</label>
          <input required type="date" style={inputStyle} value={form.startDate} onChange={setStartDate} />
        </div>
        <div>
          <label style={labelStyle}>Недель</label>
          <input type="number" min="1" style={inputStyle} value={form.weeks}
            onChange={setWeeks} placeholder="8" />
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={labelStyle}>Действует по</label>
        <input type="date" style={inputStyle} value={form.endDate} onChange={setEndDate} />
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={labelStyle}>Комментарий</label>
        <input style={inputStyle} value={form.note} onChange={set('note')}
          placeholder="Любое текстовое примечание" />
      </div>

     {/* Оплата за абонемент. За него всегда платят при выдаче: одно нажатие
          создаёт и абонемент, и доход. При правке этого блока нет. */}
     {withPayment && (
        accounts.length === 0 || incomeCategories.length === 0 ? (
          <p style={{ fontSize: '11px', color: '#b91c1c', marginBottom: '8px' }}>
             Чтобы принять оплату, заведите кассы и доходные статьи в Настройках.
          </p>
        ) : (
          <div style={{
            borderTop: '1px dashed #e5e7eb', paddingTop: '8px', marginBottom: '8px',
          }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#059669', marginBottom: '6px' }}>
               Оплата за абонемент
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={labelStyle}>Сумма оплаты</label>
                <input required type="text" inputMode="decimal" style={inputStyle}
                  value={form.payAmount} onChange={set('payAmount')} placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>Дата оплаты</label>
                <input required type="date" style={inputStyle}
                  value={form.payDate} onChange={set('payDate')} />
              </div>
              <div>
                <label style={labelStyle}>Касса</label>
                <select required style={inputStyle} value={form.payAccountId} onChange={set('payAccountId')}>
                  <option value="">Выберите…</option>
                 {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Статья</label>
                <select required style={inputStyle} value={form.payCategoryId} onChange={set('payCategoryId')}>
                  <option value="">Выберите…</option>
                 {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )
      )}

     {error && (
        <p style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}> {error}</p>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="submit"
          disabled={saving || (withPayment && (accounts.length === 0 || incomeCategories.length === 0))}
          style={{
          background: '#7c3aed', color: '#fff', border: 'none', padding: '6px 12px',
          borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>
         {saving ? 'Сохраняем...' : editing ? 'Сохранить' : 'Выдать'}
        </button>
        <button type="button" onClick={onCancel} style={{
          background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
        }}>Отмена</button>
      </div>
    </form>
  )
}
