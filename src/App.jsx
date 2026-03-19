import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Finance from './pages/Finance'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-64 bg-indigo-900 text-white flex flex-col p-6 gap-2 min-h-screen fixed">
          <h1 className="text-2xl font-bold mb-8">🎠 FinGam CRM</h1>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-sm font-medium transition ${
                isActive ? 'bg-indigo-600' : 'hover:bg-indigo-800'
              }`
            }
          >
            📊 Дашборд
          </NavLink>
          <NavLink
            to="/clients"
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-sm font-medium transition ${
                isActive ? 'bg-indigo-600' : 'hover:bg-indigo-800'
              }`
            }
          >
            👶 Клиенты
          </NavLink>
          <NavLink
            to="/finance"
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-sm font-medium transition ${
                isActive ? 'bg-indigo-600' : 'hover:bg-indigo-800'
              }`
            }
          >
            💰 Финансы
          </NavLink>
        </aside>

        {/* Main content */}
        <main className="flex-1 ml-64 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/finance" element={<Finance />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
