import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { loginUser } from '../services/authApi'
import type { AuthUser, LoginRequest } from '../types/auth'
import {
  AuthContext,
  type AuthContextValue,
} from './AuthContext'

/**
 * TaskFlow authentication provider.
 *
 * This project's backend currently issues an access JWT but no refresh cookie.
 * For this development stage, the JWT is kept in sessionStorage so a refresh
 * within the same tab does not immediately discard the authenticated session.
 * It is never saved to localStorage and is always removed when signing out.
 *
 * Important: sessionStorage is accessible to JavaScript. Before a production
 * rollout, prefer an HttpOnly, Secure, SameSite refresh-cookie flow on the
 * backend, with short-lived access tokens and appropriate CSRF protection.
 */

interface AuthSession {
  accessToken: string
  user: AuthUser
}

interface AuthProviderProps {
  children: ReactNode
}

const SESSION_KEY = 'taskflow-auth-session'

/** Validate JSON from browser storage without trusting its shape. */
function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (typeof record.id === 'string' || typeof record.id === 'number') &&
    typeof record.name === 'string' &&
    typeof record.email === 'string' &&
    typeof record.createdAt === 'string'
  )
}

function readSavedSession(): AuthSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) {
      window.sessionStorage.removeItem(SESSION_KEY)
      return null
    }

    const record = value as Record<string, unknown>
    if (typeof record.accessToken !== 'string' ||
        record.accessToken.length === 0 ||
        !isAuthUser(record.user)) {
      window.sessionStorage.removeItem(SESSION_KEY)
      return null
    }

    return {
      accessToken: record.accessToken,
      user: record.user,
    }
  } catch {
    // Storage can be disabled; the app still works until the tab is refreshed.
    return null
  }
}

function writeSavedSession(session: AuthSession): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // A storage restriction should not prevent login from succeeding.
  }
}

function clearSavedSession(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Clearing in-memory state still signs the user out of the current tab.
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Read saved state once, before ProtectedRoute renders for the first time.
  const [savedOnLoad] = useState<AuthSession | null>(readSavedSession)
  const [session, setSession] = useState<AuthSession | null>(savedOnLoad)
  const [isRestoring, setIsRestoring] = useState(savedOnLoad !== null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const restoreController = useRef<AbortController | null>(null)

  /**
   * A stored token is only a *candidate* session. Confirm it with NestJS
   * before displaying a protected page after a browser refresh.
   */
  useEffect(() => {
    const candidate = savedOnLoad
    if (!candidate || !isRestoring) return

    // Capture a non-null token before entering the async function.
    const candidateToken = candidate.accessToken

    const controller = new AbortController()
    restoreController.current = controller

    async function validateSavedSession() {
      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${candidateToken}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        })

        if (controller.signal.aborted) return

        // JWT is expired, revoked, or otherwise rejected: sign in again.
        if (response.status === 401 || response.status === 403) {
          clearSavedSession()
          setSession((current) =>
            current?.accessToken === candidateToken ? null : current,
          )
          setRestoreError(null)
          setIsRestoring(false)
          return
        }

        if (!response.ok) {
          throw new Error('Session verification was unsuccessful.')
        }

        const verifiedUser: unknown = await response.json()
        if (controller.signal.aborted) return
        if (!isAuthUser(verifiedUser)) {
          throw new Error('The server returned an invalid account response.')
        }

        const verifiedSession: AuthSession = {
          accessToken: candidateToken,
          user: verifiedUser,
        }

        // Commit storage outside the React state updater (which must be pure).
        writeSavedSession(verifiedSession)
        setSession((current) =>
          current?.accessToken === candidateToken
            ? verifiedSession
            : current,
        )
        setRestoreError(null)
        setIsRestoring(false)
      } catch {
        if (controller.signal.aborted) return
        // A network error is NOT the same as an expired session.
        // Keep the candidate token and offer Retry instead of logging out.
        setRestoreError(
          'We could not verify your session. Check your internet connection and try again.',
        )
        setIsRestoring(false)
      }
    }

    void validateSavedSession()

    return () => {
      controller.abort()
      if (restoreController.current === controller) {
        restoreController.current = null
      }
    }
  }, [savedOnLoad, isRestoring, restoreAttempt])

  /** Log in through the existing NestJS endpoint and save this tab's session. */
  const signIn = useCallback(async (credentials: LoginRequest): Promise<void> => {
    const response = await loginUser(credentials)

    if (!response.accessToken || !isAuthUser(response.user)) {
      throw new Error('The server returned an invalid login response.')
    }

    restoreController.current?.abort()
    const nextSession: AuthSession = {
      accessToken: response.accessToken,
      user: response.user,
    }

    writeSavedSession(nextSession)
    setSession(nextSession)
    setRestoreError(null)
    setIsRestoring(false)
  }, [])

  /** Always clear both the memory copy and the persisted tab session. */
  const signOut = useCallback((): void => {
    restoreController.current?.abort()
    clearSavedSession()
    setSession(null)
    setRestoreError(null)
    setIsRestoring(false)
  }, [])

  /** Update visible account details after a successful save to the backend. */
  const updateUser = useCallback((user: AuthUser): void => {
    setSession((current) => {
      if (!current || String(current.user.id) !== String(user.id)) return current
      return { ...current, user }
    })
  }, [])

  // Keep the saved tab session in sync with any profile edits.
  useEffect(() => {
    if (session && !isRestoring && !restoreError) writeSavedSession(session)
  }, [session, isRestoring, restoreError])

  /** Retry validation after a temporary network/server interruption. */
  const retryRestore = useCallback((): void => {
    if (!savedOnLoad) return
    setRestoreError(null)
    setIsRestoring(true)
    setRestoreAttempt((current) => current + 1)
  }, [savedOnLoad])

  const contextValue = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    accessToken: session?.accessToken ?? null,
    isAuthenticated: session !== null && !isRestoring && !restoreError,
    isRestoring,
    restoreError,
    signIn,
    signOut,
    retryRestore,
    updateUser,
  }), [session, isRestoring, restoreError, signIn, signOut, retryRestore, updateUser])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}
