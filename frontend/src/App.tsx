import { useEffect, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
} from 'react-router'

import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import VerifyPasswordOtpPage from './pages/VerifyPasswordOtpPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import ProtectedRoute from './routes/ProtectedRoute'

/**
 * TaskFlow Application
 *
 * Public pages: Sign in and Sign up.
 * Protected pages: Dashboard, My Tasks, and My Profile.
 * Existing theme preferences and routes are preserved.
 */
type Theme = 'light' | 'dark'

/** Read a previously saved display theme; use light as the fallback. */
function getSavedTheme(): Theme {
  try {
    const savedTheme = window.localStorage.getItem('taskflow-theme')
    return savedTheme === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getSavedTheme)

  // Only the theme preference is persisted; the JWT stays in React memory.
  useEffect(() => {
    document.documentElement.dataset.theme = theme

    try {
      window.localStorage.setItem('taskflow-theme', theme)
    } catch {
      // Theme switching still works if browser storage is unavailable.
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((currentTheme) =>
      currentTheme === 'light' ? 'dark' : 'light',
    )
  }

  return (
    <Routes>
      {/* Default entry point. */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public authentication pages. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/verify-password-otp" element={<VerifyPasswordOtpPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Both existing workspace routes remain JWT protected. */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/dashboard"
          element={
            <DashboardPage theme={theme} onToggleTheme={toggleTheme} />
          }
        />
        <Route
          path="/tasks"
          element={
            <DashboardPage theme={theme} onToggleTheme={toggleTheme} />
          }
        />
        {/* A separate protected profile page, sharing our workspace layout. */}
        <Route
          path="/profile"
          element={
            <DashboardPage theme={theme} onToggleTheme={toggleTheme} />
          }
        />
      </Route>

      {/* Existing unknown-route behavior is unchanged. */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
