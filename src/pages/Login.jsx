import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError('Неверный email или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f1f2f4',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#ffffff', border: '1px solid #e5e7eb',
        borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '400px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎠</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 }}>FinGam CRM</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '6px' }}>Войдите в систему</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>Email</label>
            <input
              type="email"
              required
              autoFocus
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', background: '#f7f8fa', border: '1px solid #e5e7eb',
                borderRadius: '10px', padding: '12px 14px', color: '#111827',
                fontSize: '14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>Пароль</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', background: '#f7f8fa', border: '1px solid #e5e7eb',
                borderRadius: '10px', padding: '12px 14px', color: '#111827',
                fontSize: '14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fecaca',
              borderRadius: '10px', padding: '10px 14px',
              color: '#dc2626', fontSize: '13px', marginBottom: '16px',
            }}>
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', background: '#7c3aed', color: '#fff',
              border: 'none', borderRadius: '12px', padding: '13px',
              fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
