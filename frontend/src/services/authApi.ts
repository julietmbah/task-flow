import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '../types/auth'

/**
 * TaskFlow Authentication API Service
 *
 * The Vite development proxy forwards:
 *
 * /api/auth/login    -> http://localhost:8080/auth/login
 * /api/auth/register -> http://localhost:8080/auth/register
 * /api/auth/me       -> http://localhost:8080/auth/me
 *
 * Production deployments will need an equivalent
 * reverse proxy or API routing configuration.
 */

const API_BASE_URL = '/api'

/**
 * Extract a readable error message from a NestJS response.
 *
 * NestJS may return its message as a string or
 * an array of validation messages.
 */
function getApiErrorMessage(
  responseBody: unknown,
  status: number,
): string {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'message' in responseBody
  ) {
    const message = responseBody.message

    if (typeof message === 'string' && message.length > 0) {
      return message
    }

    if (Array.isArray(message)) {
      const messages = message.filter(
        (item): item is string => typeof item === 'string',
      )

      if (messages.length > 0) {
        return messages.join('. ')
      }
    }
  }

  if (status === 401) {
    return 'Invalid email or password.'
  }

  if (status === 409) {
    return 'An account with this email already exists.'
  }

  if (status >= 500) {
    return 'Something went wrong on our side. Please try again in a moment.'
  }

  return 'Your request could not be completed.'
}

/**
 * Shared API request helper.
 *
 * This function:
 * - Sends HTTP requests to NestJS.
 * - Parses JSON responses.
 * - Handles network and HTTP errors.
 * - Returns typed response data.
 *
 * Authentication tokens are never logged here.
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)

  headers.set('Accept', 'application/json')

  if (options.body !== undefined && options.body !== null) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(
      `${API_BASE_URL}${endpoint}`,
      {
        ...options,
        headers,
        cache: 'no-store',
      },
    )
  } catch {
    throw new Error(
      'Unable to connect to TaskFlow. Please check your connection and try again.',
    )
  }

  // Parse the response without assuming every response is JSON.
  const responseBody: unknown = await response
    .json()
    .catch(() => null)

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(responseBody, response.status),
    )
  }

  if (responseBody === null) {
    throw new Error(
      'The server returned an unexpected response.',
    )
  }

  // The type is based on our verified backend API contract.
  return responseBody as T
}

/**
 * Log in with an existing TaskFlow account.
 *
 * Returns the access token and public user details.
 */
export async function loginUser(
  credentials: LoginRequest,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(credentials),
    },
  )
}

/**
 * Register a new TaskFlow account.
 *
 * The backend validates the information
 * and securely hashes the password.
 */
export async function registerUser(
  registrationData: RegisterRequest,
): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(registrationData),
    },
  )
}

/**
 * Retrieve the currently authenticated user's profile.
 *
 * The JWT must be supplied in the Authorization header.
 */
export async function getCurrentUser(
  accessToken: string,
): Promise<AuthUser> {
  return apiRequest<AuthUser>(
    '/auth/me',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}

/** Request a recovery email without revealing whether an account exists. */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
}

/** Redeem a one-time password reset link. */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  })
}
