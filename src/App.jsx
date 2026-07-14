import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useAuth } from './AuthContext'
import { isApproved, canManage, canSeeCompanyMoney, canSeeSettings } from './lib/access'
import { downloadBackup } from './lib/backup'
import Icon from './components/Icon'
import AccessPending from './pages/AccessPending'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientCard from './pages/ClientCard'
import Leads from './pages/Leads'
import Groups from './pages/Groups'
import Lessons from './pages/Lessons'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Login from './pages/Login'

// `can` — кто видит пункт. Педагогу остаются только «Уроки», «Клиенты» и «Группы»:
// расписание и состав. Меню — удобство; настоящий запрет стоит в правилах Firestore,
// поэтому маршруты ниже тоже закрыты, а не только скрыты из навигации.
// У каждого раздела свой цвет иконки — так пункт узнаётся боковым зрением,
// не читая подпись. Подписи остаются нейтральными: цветной текст на цветном
// фоне активного пункта читался бы хуже.
const NAV_ITEMS = [
  { to: '/', label: 'Дашборд', icon: 'dashboard', color: '#7c3aed', end: true, can: canManage },
  { to: '/lessons', label: 'Уроки', icon: 'lessons', color: '#2563eb' },
  { to: '/clients', label: 'Клиенты', icon: 'clients', color: '#0891b2' },
  { to: '/finance', label: 'Финансы', icon: 'finance', color: '#059669', can: canSeeCompanyMoney },
  { to: '/groups', label: 'Группы', icon: 'groups', color: '#4f46e5' },
  { to: '/leads', label: 'Лиды', icon: 'leads', color: '#e11d48', can: canManage },
  { to: '/reports', label: 'Отчёты', icon: 'reports', color: '#d97706', can: canManage },
  { to: '/settings', label: 'Настройки', icon: 'settings', color: '#6b7280', can: canSeeSettings },
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

  const manages = canManage(user.uid, profile)
  const seesMoney = canSeeCompanyMoney(user.uid, profile)
  const seesSettings = canSeeSettings(user.uid, profile)
  const navItems = NAV_ITEMS.filter(item => !item.can || item.can(user.uid, profile))

  // Педагогу дашборд закрыт, поэтому корень ведёт в расписание.
  const home = manages ? <Dashboard /> : <Navigate to="/lessons" replace />

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
            <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 }}>FinGam CRM</h1>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', wordBreak: 'break-all' }}>{user.email}</p>
          </div>

          {navItems.map(({ to, label, icon, color, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => navItem(isActive)}>
              <Icon name={icon} style={{ color }} />
              {label}
            </NavLink>
          ))}

          {/* Backup + Logout. Копия выгружает все коллекции разом, включая кассы,
              поэтому она только для админа: у остальных запрос отклонят правила. */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {seesMoney && (
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
              <Icon name="backup" size={16} />
              {backingUp ? 'Сохраняем...' : 'Резервная копия'}
            </button>
            )}
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
              <Icon name="logout" size={16} />
              Выйти
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ marginLeft: '220px', padding: '28px', minHeight: '100vh' }}>
          {/* Закрытые страницы не просто скрыты из меню: по прямой ссылке
              педагога тоже развернёт обратно в расписание. */}
          <Routes>
            <Route path="/" element={home} />
            <Route path="/leads" element={manages ? <Leads /> : <Navigate to="/lessons" replace />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientCard />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/lessons" element={<Lessons />} />
            <Route path="/finance" element={seesMoney ? <Finance /> : <Navigate to="/lessons" replace />} />
            <Route path="/reports" element={manages ? <Reports /> : <Navigate to="/lessons" replace />} />
            {/* Расходы переехали в «Финансы». Старые закладки не должны ломаться. */}
            <Route path="/expenses" element={<Navigate to="/finance" replace />} />
            <Route path="/settings" element={seesSettings ? <Settings /> : <Navigate to="/lessons" replace />} />
          </Routes>
        </main>

        {/* Mobile bottom nav.
            Пунктов до девяти, и на экране в 400px подписи налезали друг на друга.
            Поэтому панель прокручивается вбок, а у каждого пункта своя минимальная
            ширина: лучше листнуть, чем читать слипшиеся слова. */}
        <nav style={{
          display: 'none',
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#ffffff', borderTop: '1px solid #e5e7eb',
          padding: '8px 4px', zIndex: 50,
          overflowX: 'auto',
        }} className="mobile-nav">
          {[
            ...navItems,
            { label: 'Выйти', icon: 'logout', onClick: () => signOut(auth) },
          ].map(({ to, label, icon, color, end, onClick }) => {
            const item = (isActive) => ({
              flex: '1 0 auto', minWidth: '62px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              textDecoration: 'none', fontSize: '10px', fontWeight: '600',
              whiteSpace: 'nowrap', padding: '2px 4px',
              color: isActive ? '#7c3aed' : '#6b7280',
              background: 'none', border: 'none', cursor: 'pointer',
            })

            return to ? (
              <NavLink key={to} to={to} end={end} style={({ isActive }) => item(isActive)}>
                <Icon name={icon} size={20} style={{ color }} />
                {label}
              </NavLink>
            ) : (
              <button key={label} onClick={onClick} style={item(false)}>
                <Icon name={icon} size={20} />
                {label}
              </button>
            )
          })}
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
