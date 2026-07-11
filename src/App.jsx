import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useAuth } from './AuthContext'
import { isApproved } from './lib/access'
import { downloadBackup } from './lib/backup'
import AccessPending from './pages/AccessPending'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientCard from './pages/ClientCard'
import Leads from './pages/Leads'
import Groups from './pages/Groups'
import Lessons from './pages/Lessons'
import Finance from './pages/Finance'
import Settings from './pages/Settings'
import Login from './pages/Login'

const NAV_ITEMS = [
  { to: '/', label: 'Дашборд', icon: '📊', end: true },
  { to: '/lessons', label: 'Уроки', icon: '📅' },
  { to: '/clients', label: 'Клиенты', icon: '👶' },
  { to: '/finance', label: 'Финансы', icon: '💰' },
  { to: '/groups', label: 'Группы', icon: '👥' },
  { to: '/leads', label: 'Лиды', icon: '🎯' },
  { to: '/settings', label: 'Настройки', icon: '⚙️' },
]

const navItem = (isActive) => ({
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '10px 12px', borderRadius: '10px',
  fontSize: '14px', fontWeight: '500',
  textDecoration: 'none', transition: 'all 0.15s',
  background: isActive ? '#ede9fe' : 'transparent',
  color: isActive ? '#7c3aed' : '#4b5563',
})

function App() {
  const { user, profile } = useAuth()
  const [backingUp, setBackingUp] = useState(false)

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      await downloadBackup()
    } catch (e) {
      console.error(e)
      alert('Не удалось создать резервную копию. Проверьте интернет и попробуйте снова.')
    } finally {
      setBackingUp(false)
    }
  }

  // Загрузка: ждём и аккаунт, и его профиль — иначе одобренный сотрудник
  // на миг увидел бы экран «доступ не выдан».
  if (user === undefined || (user && profile === undefined)) {
    return (
      <div style={{
        minHeight: '100vh', background: '#f1f2f4',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ color: '#6b7280', fontSize: '14px' }}>Загрузка...</div>
      </div>
    )
  }

  // Не авторизован
  if (!user) return <Login />

  // Аккаунт есть, но доступ ещё не выдан. Данных всё равно не покажем:
  // то же условие стоит в правилах Firestore.
  if (!isApproved(user.uid, profile)) return <AccessPending user={user} />

  // Авторизован
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <div style={{ minHeight: '100vh', background: '#f1f2f4' }}>

        {/* Desktop sidebar */}
        <aside style={{
          width: '220px', background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          position: 'fixed', top: 0, left: 0, bottom: 0,
          display: 'flex', flexDirection: 'column',
          padding: '20px 12px',
        }} className="hidden-mobile">
          <div style={{ padding: '0 8px', marginBottom: '28px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 }}>🎠 FinGam CRM</h1>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', wordBreak: 'break-all' }}>{user.email}</p>
          </div>

          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => navItem(isActive)}>
              <span style={{ fontSize: '18px' }}>{icon}</span>
              {label}
            </NavLink>
          ))}

          {/* Backup + Logout */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleBackup}
              disabled={backingUp}
              style={{
                width: '100%', background: 'transparent',
                border: '1px solid #e5e7eb', borderRadius: '10px',
                padding: '10px 12px', color: '#6b7280',
                fontSize: '14px', cursor: backingUp ? 'not-allowed' : 'pointer',
                opacity: backingUp ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!backingUp) { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.color = '#7c3aed' } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280' }}
            >
              💾 {backingUp ? 'Сохраняем...' : 'Резервная копия'}
            </button>
            <button
              onClick={() => signOut(auth)}
              style={{
                width: '100%', background: 'transparent',
                border: '1px solid #e5e7eb', borderRadius: '10px',
                padding: '10px 12px', color: '#6b7280',
                fontSize: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#dc2626'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280' }}
            >
              🚪 Выйти
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ marginLeft: '220px', padding: '28px', minHeight: '100vh' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientCard />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/lessons" element={<Lessons />} />
            <Route path="/finance" element={<Finance />} />
            {/* Расходы переехали в «Финансы». Старые закладки не должны ломаться. */}
            <Route path="/expenses" element={<Navigate to="/finance" replace />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>

        {/* Mobile bottom nav */}
        <nav style={{
          display: 'none',
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#ffffff', borderTop: '1px solid #e5e7eb',
          padding: '8px 0', zIndex: 50,
        }} className="mobile-nav">
          {[
            ...NAV_ITEMS,
            { label: 'Выйти', icon: '🚪', onClick: () => signOut(auth) },
          ].map(({ to, label, icon, end, onClick }) => (
            to ? (
              <NavLink key={to} to={to} end={end} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', textDecoration: 'none', fontSize: '10px', fontWeight: '600', color: '#6b7280' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                {label}
              </NavLink>
            ) : (
              <button key={label} onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', fontSize: '10px', fontWeight: '600', color: '#6b7280', cursor: 'pointer' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                {label}
              </button>
            )
          ))}
        </nav>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .mobile-nav { display: flex !important; }
          main { margin-left: 0 !important; padding: 16px 16px 80px !important; }
        }
      `}</style>
    </BrowserRouter>
  )
}

export default App
