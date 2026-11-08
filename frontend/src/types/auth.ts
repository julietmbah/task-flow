
/**
 * TaskFlow Authentication Types
 *
 * These interfaces describe the request and response
 * structures used by the NestJS authentication API.
 */

/**
 * Public information returned for an authenticated user.
 *
 * createdAt is a string because JSON serializes
 * JavaScript Date values into ISO date strings.
 */
export interface AuthUser {
  id: string | number
  name: string
  email: string
  createdAt: string
}

/**
 * Request body for POST /auth/login.
 */
export interface LoginRequest {
  email: string
  password: string
}

/**
 * Response returned by a successful login.
 */
export interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  user: AuthUser
}

/**
 * Request body for POST /auth/register.
 */
export interface RegisterRequest {
  name: string
  email: string
  password: string
}

/**
 * Registration returns the new user's
 * public information without a password hash.
 */
export type RegisterResponse = AuthUser
