import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from '../hooks/useAuth'

/**
 * Keep protected pages private while a saved JWT is checked with NestJS.
 * The route is not redirected just because React initially has no verified
 * session on a page refresh.
 */
export default function ProtectedRoute() {
  const location = useLocation()
  const {
    isAuthenticated,
    isRestoring,
    restoreError,
    retryRestore,
    signOut,
  } = useAuth()

  if (isRestoring) {
    return (
      <main className="tf-session-gate" role="status" aria-live="polite">
        <div className="tf-session-panel">
          <span className="tf-session-spinner" aria-hidden="true" />
          <p className="form-kicker">TASKFLOW WORKSPACE</p>
          <h1>Restoring your session</h1>
          <p>Verifying your sign-in securely. Your workspace will open automatically.</p>
        </div>
      </main>
    )
  }

  if (restoreError) {
    return (
      <main className="tf-session-gate">
        <div className="tf-session-panel" role="alert">
          <p className="form-kicker">CONNECTION PROBLEM</p>
          <h1>We couldn't verify your session</h1>
          <p>{restoreError}</p>
          <div className="tf-session-actions">
            <button type="button" className="tf-session-retry" onClick={retryRestore}>
              Try again
            </button>
            <button type="button" className="tf-session-exit" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </main>
    )
  }

  return isAuthenticated
    ? <Outlet />
    : <Navigate to="/login" state={{ from: location }} replace />
}
