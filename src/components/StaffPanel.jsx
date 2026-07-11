import { useEffect, useState } from 'react'
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { withTimeout, describeError } from '../lib/withTimeout'
import { ROLES, ROLE_STAFF, isOwner } from '../lib/access'
import ErrorBanner from './ErrorBanner'

const btn = (color = '#7c3aed') => ({
  background: color, color: '#fff', border: 'none', borderRadius: '8px',
  padding: '7px 12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
})

const ghost = {
  background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb',
  borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer',
}

const th = {
  textAlign: 'left', fontSize: '12px', color: '#6b7280',
  fontWeight: '600', padding: '10px 12px', borderBottom: '1px solid #e5e7eb',
}

const td = { fontSize: '13px', color: '#111827', padding: '12px', borderBottom: '1px solid #e5e7eb' }

const chip = (bg, color) => ({
  display: 'inline-block', background: bg, color,
  borderRadius: '6px', padding: '3px 9px', fontSize: '12px', fontWeight: '600',
})

// Доступ к системе. Аккаунт заводит себе сотрудник сам (форма регистрации),
// а включает его здесь админ. Пока не включён — данных он не видит: то же
// условие стоит в правилах Firestore, не только на экране.
export default function StaffPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    setLoadError('')
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      const snap = await withTimeout(getDocs(collection(db, 'users')))
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const run = async (action) => {
    setSaving(true)
    try {
      if (auth.currentUser) await withTimeout(auth.currentUser.getIdToken())
      await action()
      await fetchData()
    } catch (e) {
      console.error(e)
      setLoadError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  const setApproved = (u, approved) => run(() =>
    updateDoc(doc(db, 'users', u.id), { approved }))

  const setRole = (u, role) => run(() =>
    updateDoc(doc(db, 'users', u.id), { role }))

  // Удаляем только заявку. Сам аккаунт в Firebase Auth остаётся — убрать его
  // можно лишь в консоли, из браузера это не сделать.
  const remove = (u) => {
    if (!confirm(`Удалить заявку «${u.name || u.email}»? Доступ к данным пропадёт.`)) return
    run(() => deleteDoc(doc(db, 'users', u.id)))
  }

  const me = auth.currentUser?.uid
  const waiting = users.filter(u => !u.approved)
  const allowed = users.filter(u => u.approved)

  if (loading) return <p style={{ fontSize: '13px', color: '#6b7280' }}>Загружаем…</p>

  const row = (u) => (
    <tr key={u.id}>
      <td style={td}>
        {u.name || '—'}
        {u.id === me && <span style={{ fontSize: '11px', color: '#6b7280' }}> (вы)</span>}
        <div style={{ fontSize: '12px', color: '#6b7280' }}>{u.email}</div>
      </td>
      <td style={td}>
        {isOwner(u.id) ? (
          <span style={chip('#ede9fe', '#5b21b6')}>Владелец</span>
        ) : (
          <select value={u.role || ROLE_STAFF} disabled={saving}
            onChange={e => setRole(u, e.target.value)}
            style={{
              background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px',
              padding: '6px 8px', fontSize: '13px', color: '#111827', outline: 'none',
            }}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        )}
      </td>
      <td style={td}>
        {u.approved
          ? <span style={chip('#dcfce7', '#059669')}>Доступ есть</span>
          : <span style={chip('#fef3c7', '#b45309')}>Ждёт одобрения</span>}
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {/* Владельца трогать нельзя: сняв ему доступ, систему некому будет открыть. */}
        {!isOwner(u.id) && (
          <>
            {u.approved
              ? <button onClick={() => setApproved(u, false)} disabled={saving} style={ghost}>Забрать доступ</button>
              : <button onClick={() => setApproved(u, true)} disabled={saving} style={btn('#059669')}>Дать доступ</button>}
            <button onClick={() => remove(u)} disabled={saving}
              style={{ ...ghost, color: '#dc2626', marginLeft: '8px' }}>✕</button>
          </>
        )}
      </td>
    </tr>
  )

  return (
    <div>
      <ErrorBanner message={loadError} onRetry={fetchData} />

      <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px', lineHeight: 1.5 }}>
        Сотрудник регистрируется сам — по коду приглашения. Пока вы не нажали «Дать доступ»,
        он не видит ни одной записи. Роль «Админ» позволяет выдавать доступ другим.
      </p>

      {waiting.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: '0 0 8px' }}>
            Ждут одобрения ({waiting.length})
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff', borderRadius: '12px' }}>
            <thead><tr><th style={th}>Кто</th><th style={th}>Роль</th><th style={th}>Статус</th><th style={th} /></tr></thead>
            <tbody>{waiting.map(row)}</tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: '0 0 8px' }}>
        С доступом ({allowed.length})
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff', borderRadius: '12px' }}>
        <thead><tr><th style={th}>Кто</th><th style={th}>Роль</th><th style={th}>Статус</th><th style={th} /></tr></thead>
        <tbody>
          {allowed.length === 0 && (
            <tr><td style={{ ...td, color: '#6b7280' }} colSpan={4}>Пока никого</td></tr>
          )}
          {allowed.map(row)}
        </tbody>
      </table>
    </div>
  )
}
