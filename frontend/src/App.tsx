import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout/Layout'
import AdminLayout from './components/Layout/AdminLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyForm from './pages/PropertyForm'
import Playground from './pages/Playground'
import Leads from './pages/Leads'
import Logs from './pages/Logs'
import ToolsPage from './pages/ToolsPage'
import Settings from './pages/Settings'
import WorkspaceSettings from './pages/WorkspaceSettings'
import TokenSettings from './pages/TokenSettings'
import SuperAdmin from './pages/SuperAdmin'
import SettingsLayout from './components/Layout/SettingsLayout'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('rea_token'))

  useEffect(() => {
    const check = () => setIsLoggedIn(!!localStorage.getItem('rea_token'))
    window.addEventListener('storage', check)
    return () => window.removeEventListener('storage', check)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={
            isLoggedIn ? <Navigate to="/dashboard" replace /> : <Login onLogin={() => setIsLoggedIn(true)} />
          } 
        />
        
        <Route 
          path="/" 
          element={
            isLoggedIn ? <Layout /> : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="properties" element={<Properties />} />
          <Route path="properties/new" element={<PropertyForm />} />
          <Route path="properties/:id/edit" element={<PropertyForm />} />
          <Route path="playground" element={<Navigate to="/playground/agents" replace />} />
          <Route path="playground/agents" element={<Playground />} />
          <Route path="playground/tools" element={<ToolsPage />} />
          <Route path="leads" element={<Leads />} />
          <Route path="logs" element={<Logs />} />
        </Route>

        {/* Rotas de Configuração (Layout Próprio) */}
        <Route 
          path="/settings" 
          element={isLoggedIn ? <SettingsLayout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Settings />} />
          <Route path="workspace" element={<WorkspaceSettings />} />
          <Route path="token" element={<TokenSettings />} />
        </Route>

        {/* Rotas de Administração Global (Painel Separado) */}
        <Route 
          path="/admin" 
          element={isLoggedIn ? <AdminLayout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<SuperAdmin />} />
          <Route path="users" element={<SuperAdmin />} /> {/* Por enquanto SuperAdmin centraliza, podemos quebrar depois */}
          <Route path="workspaces" element={<SuperAdmin />} />
          <Route path="system" element={<Logs />} />
        </Route>

        {/* Alias para manter compatibilidade */}
        <Route path="/superadmin" element={<Navigate to="/admin/dashboard" replace />} />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
