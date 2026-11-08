import { createContext } from 'react'

import type { AuthUser, LoginRequest } from '../types/auth'

/**
 * TaskFlow authentication contract.
 *
 * JWT sessions can now be recovered after a page refresh. The route guard
 * waits for recovery before deciding whether the user must sign in again.
 */
export interface AuthContextValue {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean

  /** True while a saved session is being validated with GET /auth/me. */
  isRestoring: boolean

  /** Non-null when session validation failed due to a temporary problem. */
  restoreError: string | null

  signIn: (credentials: LoginRequest) => Promise<void>
  signOut: () => void

  /** Refresh the name shown in the navbar after saving profile changes. */
  updateUser: (user: AuthUser) => void
  retryRestore: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
