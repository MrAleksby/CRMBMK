import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

// Аккаунт заведён, но админ доступ ещё не включил. Экран висит до одобрения:
// профиль слушается через onSnapshot, поэтому система откроется сама,
// перезаходить не нужно.
export default function AccessPending({ user }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f1f2f4',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '20px',
        padding: '40px', width: '100%', maxWidth: '440px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>⏳</div>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 }}>
          Доступ ещё не выдан
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '10px 0 0', lineHeight: 1.5 }}>
          Заявка отправлена. Руководитель включит доступ в разделе «Настройки → Сотрудники»,
          и система откроется здесь же — обновлять страницу не нужно.
        </p>
        <p style={{ fontSize: '13px', color: '#4b5563', margin: '18px 0 0' }}>{user.email}</p>

        <button onClick={() => signOut(auth)} style={{
          marginTop: '24px', background: 'transparent', border: '1px solid #e5e7eb',
          borderRadius: '10px', padding: '10px 16px', color: '#6b7280',
          fontSize: '14px', cursor: 'pointer',
        }}>
          🚪 Выйти
        </button>
      </div>
    </div>
  )
}
