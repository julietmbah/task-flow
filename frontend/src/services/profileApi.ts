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
