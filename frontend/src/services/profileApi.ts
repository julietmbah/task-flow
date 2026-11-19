import type { AuthUser } from '../types/auth'

/**
 * Profile API service.
 * All requests use the active access token and the existing Vite /api proxy.
 * User-facing messages deliberately avoid developer terminology.
 */
const BASE = '/api/auth/me'

async function messageFor(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return 'Your sign-in has ended. Please sign in again.'
  }
  if (response.status === 413) return 'That photo is too large. Please choose one under 2 MB.'
  if (response.status === 400 || response.status === 422) {
    return 'Please check your details and try again.'
  }
  if (response.status >= 500) {
    return 'Something went wrong on our side. Please try again shortly.'
  }
  return 'We could not save your changes. Please try again.'
}

async function request(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  let response: Response
  try {
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    response = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    })
  } catch (cause) {
    throw new Error(
      'We could not connect. Please check your internet connection and try again.',
      { cause },
    )
  }
  return response
}

/** Save the display name to the user's PostgreSQL account. */
export async function saveProfileName(accessToken: string, name: string): Promise<AuthUser> {
  const response = await request(accessToken, '', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(await messageFor(response))
  return response.json() as Promise<AuthUser>
}

/** Retrieve a photo as a Blob; a missing photo is normal. */
export async function loadProfilePhoto(accessToken: string): Promise<Blob | null> {
  const response = await request(accessToken, '/photo')
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await messageFor(response))
  return response.blob()
}

/** Upload an image; FormData sets its own multipart boundary. */
export async function saveProfilePhoto(accessToken: string, photo: File): Promise<void> {
  const data = new FormData()
  data.append('photo', photo)
  const response = await request(accessToken, '/photo', {
    method: 'POST',
    body: data,
  })
  if (!response.ok) throw new Error(await messageFor(response))
}

/** Remove the current user's photo from the server. */
export async function deleteProfilePhoto(accessToken: string): Promise<void> {
  const response = await request(accessToken, '/photo', { method: 'DELETE' })
  if (!response.ok) throw new Error(await messageFor(response))
}

/** The fields accepted by PATCH /auth/me/password. */
export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

/**
 * Change the current user's password.
 * Only helpful messages are shown; no account secrets are logged or stored.
 */
export async function changeProfilePassword(
  accessToken: string,
  passwords: ChangePasswordRequest,
): Promise<void> {
  const response = await request(accessToken, '/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(passwords),
  })

  if (response.ok) return

  if (response.status === 400 || response.status === 422) {
    const body: unknown = await response.json().catch(() => null)
    const rawMessage = (
      body !== null && typeof body === 'object' && 'message' in body
        ? body.message
        : null
    )
    const messages = typeof rawMessage === 'string'
      ? [rawMessage]
      : Array.isArray(rawMessage)
        ? rawMessage.filter((item): item is string => typeof item === 'string')
        : []

    // Allow only known safe validation messages through to the interface.
    const message = messages.find((text) => [
      'Your current password is incorrect.',
      'Your new password is too long. Please choose a shorter one.',
      'Choose a new password that is different from your current one.',
      'Your new password must be at least 8 characters long.',
      'Please enter your current password.',
      'Please enter a new password.',
    ].includes(text))
    throw new Error(message ?? 'Please check your passwords and try again.')
  }

  if (response.status === 409) {
    throw new Error('Your password was recently changed. Please sign in again and try again.')
  }

  throw new Error(await messageFor(response))
}


/** Email-change OTP uses the current signed-in account, never the email in the URL. */
interface EmailCodeResponse { message: string; newEmail: string }
interface EmailVerifiedResponse { message: string; email: string }

async function changeEmailError(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return 'Your sign-in has ended. Please sign in again.'
  }
  const payload: unknown = await response.json().catch(() => null)
  const raw = payload && typeof payload === 'object' && 'message' in payload
    ? payload.message : null
  const messages = typeof raw === 'string' ? [raw]
    : Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []
  // Show only known, safe API messages; don't expose internal error details.
  const known = [
    'Please enter a valid email address.',
    'Please enter your new email address.',
    'This is already your current email address.',
    'This email address is already in use.',
    'Please use a private email address.',
    'Please wait 60 seconds before requesting another code.',
    'Start a new email change request first.',
    'This code is incorrect or has expired. Please request a new one.',
    'Enter the six-digit code from your new email.',
    'Email verification is temporarily unavailable. Please try again later.',
    'We could not send the code. Your current email has not changed. Please try again.',
    'Your account changed. Please start again.',
  ]
  const matchingMessage = messages.find((value) => known.includes(value))
  if (matchingMessage) return matchingMessage
  if (response.status === 429) return 'Too many attempts. Please try again later.'
  if (response.status >= 500) return 'Something went wrong. Please try again shortly.'
  return 'We could not complete your request. Please check your details and try again.'
}

async function emailPost<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  const response = await request(accessToken, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!response.ok) throw new Error(await changeEmailError(response))
  return response.json() as Promise<T>
}

export function requestChangeEmailOtp(accessToken: string, newEmail: string): Promise<EmailCodeResponse> {
  return emailPost<EmailCodeResponse>(accessToken, '/email/request', { newEmail })
}

export function resendChangeEmailOtp(accessToken: string): Promise<EmailCodeResponse> {
  return emailPost<EmailCodeResponse>(accessToken, '/email/resend')
}

export function verifyChangeEmailOtp(accessToken: string, otp: string): Promise<EmailVerifiedResponse> {
  return emailPost<EmailVerifiedResponse>(accessToken, '/email/verify', { otp })
}
