import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useAuth } from './AuthContext'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Finance from './pages/Finance'
import Expenses from './pages/Expenses'
import Login from './pages/Login'

const navItem = (isActive) => ({
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '10px 12px', borderRadius: '10px',
  fontSize: '14px', fontWeight: '500',
  textDecoration: 'none', transition: 'all 0.15s',
  background: isActive ? '#2a2a3e' : 'transparent',
  color: isActive ? '#a78bfa' : '#9ca3af',
})

function App() {
  const user = useAuth()

  // Загрузка
  if (user === undefined) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f0f13',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ color: '#6b6b80', fontSize: '14px' }}>Загрузка...</div>
      </div>
    )
  }

  // Не авторизован
  if (!user) return <Login />

  // Авторизован
  return (
    <BrowserRouter basename="/CRMBMK">
      <div style={{ minHeight: '100vh', background: '#0f0f13' }}>

        {/* Desktop sidebar */}
        <aside style={{
          width: '220px', background: '#16161e',
          borderRight: '1px solid #2a2a35',
          position: 'fixed', top: 0, left: 0, bottom: 0,
          display: 'flex', flexDirection: 'column',
          padding: '20px 12px',
        }} className="hidden-mobile">
          <div style={{ padding: '0 8px', marginBottom: '28px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0 }}>🎠 FinGam CRM</h1>
            <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '4px', wordBreak: 'break-all' }}>{user.email}</p>
          </div>

          {[
            { to: '/', label: 'Дашборд', icon: '📊', end: true },
            { to: '/clients', label: 'Клиенты', icon: '👶' },
            { to: '/finance', label: 'Финансы', icon: '💰' },
            { to: '/expenses', label: 'Расходы', icon: '📉' },
          ].map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => navItem(isActive)}>
              <span style={{ fontSize: '18px' }}>{icon}</span>
              {label}
            </NavLink>
          ))}

          {/* Logout */}
          <div style={{ marginTop: 'auto' }}>
            <button
              onClick={() => signOut(auth)}
              style={{
                width: '100%', background: 'transparent',
                border: '1px solid #2a2a35', borderRadius: '10px',
                padding: '10px 12px', color: '#6b6b80',
                fontSize: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#f87171'; e.currentTarget.style.color = '#f87171' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a35'; e.currentTarget.style.color = '#6b6b80' }}
            >
              🚪 Выйти
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ marginLeft: '220px', padding: '28px', minHeight: '100vh' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/expenses" element={<Expenses />} />
          </Routes>
        </main>

        {/* Mobile bottom nav */}
        <nav style={{
          display: 'none',
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#16161e', borderTop: '1px solid #2a2a35',
          padding: '8px 0', zIndex: 50,
        }} className="mobile-nav">
          {[
            { to: '/', label: 'Дашборд', icon: '📊', end: true },
            { to: '/clients', label: 'Клиенты', icon: '👶' },
            { to: '/finance', label: 'Финансы', icon: '💰' },
            { to: '/expenses', label: 'Расходы', icon: '📉' },
            { label: 'Выйти', icon: '🚪', onClick: () => signOut(auth) },
          ].map(({ to, label, icon, end, onClick }) => (
            to ? (
              <NavLink key={to} to={to} end={end} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', textDecoration: 'none', fontSize: '10px', fontWeight: '600', color: '#6b6b80' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                {label}
              </NavLink>
            ) : (
              <button key={label} onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', fontSize: '10px', fontWeight: '600', color: '#6b6b80', cursor: 'pointer' }}>
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
