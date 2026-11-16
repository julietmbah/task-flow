
import { useContext } from 'react'

import {
  AuthContext,
  type AuthContextValue,
} from '../contexts/AuthContext'

/**
 * Access TaskFlow authentication information.
 *
 * Components using this hook must be rendered
 * inside AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error(
      'useAuth must be used inside AuthProvider.',
    )
  }

  return context
}
