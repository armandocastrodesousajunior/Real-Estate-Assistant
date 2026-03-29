import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyForm from './pages/PropertyForm'
import Playground from './pages/Playground'
import Leads from './pages/Leads'
import Logs from './pages/Logs'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('rea_token'))

  useEffect(() => {
    const check = () => setIsLoggedIn(!!localStorage.getItem('rea_token'))
    window.addEventListener('storage', check)
    return () => window.removeEventListener('storage', check)
  }, [])

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="properties" element={<Properties />} />
          <Route path="properties/new" element={<PropertyForm />} />
          <Route path="properties/:id/edit" element={<PropertyForm />} />
          <Route path="playground" element={<Playground />} />
          <Route path="leads" element={<Leads />} />
          <Route path="logs" element={<Logs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
