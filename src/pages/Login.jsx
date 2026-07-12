import { useState } from 'react'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { newUserDoc, inviteCodeOk } from '../lib/access'

const field = {
  width: '100%', background: '#f7f8fa', border: '1px solid #e5e7eb',
  borderRadius: '10px', padding: '12px 14px', color: '#111827',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box',
}

const label = { fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '6px' }

const tab = (active) => ({
  flex: 1, background: active ? '#ede9fe' : 'transparent',
  color: active ? '#7c3aed' : '#6b7280',
  border: `1px solid ${active ? '#ddd6fe' : '#e5e7eb'}`,
  borderRadius: '10px', padding: '9px', fontSize: '13px',
  fontWeight: '600', cursor: 'pointer',
})

// Firebase отвечает кодами; человеку нужен человеческий текст.
const signUpError = (code) => {
  if (code === 'auth/email-already-in-use') return 'Такой email уже зарегистрирован — войдите'
  if (code === 'auth/weak-password') return 'Пароль слишком короткий: нужно хотя бы 6 символов'
  if (code === 'auth/operation-not-allowed') return 'Регистрация отключена в Firebase. Включите её в консоли'
  return 'Не удалось зарегистрироваться. Проверьте данные и попробуйте снова'
}

export default function Login() {
  const [mode, setMode] = useState('login')   // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [invite, setInvite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const switchMode = (next) => { setMode(next); setError('') }

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      setError('Неверный email или пароль')
    }
  }

  // Регистрация заводит аккаунт и заявку на доступ. Данных новичок не увидит,
  // пока админ не одобрит: это же условие стоит в правилах Firestore.
  const handleSignUp = async () => {
    if (!inviteCodeOk(invite)) {
      setError('Неверный код приглашения — спросите его у руководителя')
      return
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await setDoc(doc(db, 'users', cred.user.uid), newUserDoc({
        uid: cred.user.uid, email: cred.user.email, name,
      }))
    } catch (err) {
      console.error(err)
      setError(signUpError(err?.code))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'login') await handleLogin()
      else await handleSignUp()
    } finally {
      setLoading(false)
    }
  }

  const isSignUp = mode === 'signup'

  return (
    <div style={{
      minHeight: '100vh', background: '#f1f2f4',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#ffffff', border: '1px solid #e5e7eb',
        borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '400px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 }}>FinGam CRM</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '6px' }}>
            {isSignUp ? 'Заявка на доступ' : 'Войдите в систему'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button type="button" onClick={() => switchMode('login')} style={tab(!isSignUp)}>Вход</button>
          <button type="button" onClick={() => switchMode('signup')} style={tab(isSignUp)}>Регистрация</button>
        </div>

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div style={{ marginBottom: '16px' }}>
              <label style={label}>Имя и фамилия</label>
              <input type="text" required autoFocus placeholder="Муниса Гришанович"
                value={name} onChange={e => setName(e.target.value)} style={field} />
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={label}>Email</label>
            <input type="email" required autoFocus={!isSignUp} placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)} style={field} />
          </div>

          <div style={{ marginBottom: isSignUp ? '16px' : '24px' }}>
            <label style={label}>Пароль</label>
            <input type="password" required placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} style={field} />
          </div>

          {isSignUp && (
            <div style={{ marginBottom: '24px' }}>
              <label style={label}>Код приглашения</label>
              <input type="text" required placeholder="спросите у руководителя"
                value={invite} onChange={e => setInvite(e.target.value)} style={field} />
            </div>
          )}

          {error && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fecaca',
              borderRadius: '10px', padding: '10px 14px',
              color: '#dc2626', fontSize: '13px', marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', background: '#7c3aed', color: '#fff',
            border: 'none', borderRadius: '12px', padding: '13px',
            fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
          }}>
            {loading
              ? (isSignUp ? 'Регистрируем...' : 'Вход...')
              : (isSignUp ? 'Запросить доступ' : 'Войти')}
          </button>
        </form>

        {isSignUp && (
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '16px', textAlign: 'center' }}>
            После регистрации доступ включит руководитель — до этого данные не откроются.
          </p>
        )}
      </div>
    </div>
  )
}
