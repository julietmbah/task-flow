import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import ChangePasswordSection from './ChangePasswordSection'

import { useAuth } from '../hooks/useAuth'
import { getCurrentUser } from '../services/authApi'
import {
  deleteProfilePhoto,
  loadProfilePhoto,
  saveProfileName,
  saveProfilePhoto,
} from '../services/profileApi'
import type { AuthUser } from '../types/auth'

/**
 * TaskFlow — My Profile
 *
 * Shows real account details and provides secure name and photo editing.
 * Only the current signed-in user can update their own information.
 * The UI deliberately uses everyday language, including for errors.
 * All styles are in the existing src/index.css file.
 */

type IconName = 'user' | 'mail' | 'calendar' | 'shield' | 'arrow' | 'refresh' | 'check' | 'tasks' | 'camera' | 'trash' | 'edit'
type PageState = 'loading' | 'ready' | 'error'
type BusyAction = 'name' | 'photo' | 'remove' | null
interface Notice { type: 'success' | 'error'; text: string }

const iconPaths: Record<IconName, ReactNode> = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.5-2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  tasks: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1.5 1.5L12 8M8 16h9" /></>,
  camera: <><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="3" /></>,
  trash: <><path d="M4 7h16M10 11v7M14 11v7M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  edit: <><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z" /></>,
}

function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {iconPaths[name]}
    </svg>
  )
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'TF'
}

function memberSince(isoDate: string): string {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export default function ProfilePage() {
  const { accessToken, updateUser } = useAuth()
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [pageError, setPageError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const photoUrlRef = useRef<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  // Show successful changes briefly, then close the message automatically.
  // Errors stay visible so the user has time to read them.
  useEffect(() => {
    if (notice?.type !== 'success') return

    const timeoutId = window.setTimeout(() => {
      setNotice(null)
    }, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [notice])

  // Replace old browser object URLs so images do not accumulate in memory.
  const showPhoto = useCallback((blob: Blob | null) => {
    const next = blob ? URL.createObjectURL(blob) : null
    const previous = photoUrlRef.current
    photoUrlRef.current = next
    setPhotoUrl(next)
    if (previous) URL.revokeObjectURL(previous)
  }, [])

  useEffect(() => {
    const photoRef = photoUrlRef
    return () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current)
    }
  }, [])

  // Load account details from the existing protected endpoint.
  useEffect(() => {
    let active = true
    if (!accessToken) return () => { active = false }

    getCurrentUser(accessToken)
      .then((account) => {
        if (!active) return
        setProfile(account)
        setName(account.name)
        setPageState('ready')
        setPageError('')
      })
      .catch(() => {
        if (!active) return
        setPageState('error')
        setPageError('We could not load your details. Please try again.')
      })

    return () => { active = false }
  }, [accessToken, reloadKey])

  // A missing photo is normal: show the user's initials instead.
  useEffect(() => {
    let active = true
    if (!accessToken) return () => { active = false }

    loadProfilePhoto(accessToken)
      .then((blob) => { if (active) showPhoto(blob) })
      .catch(() => {
        if (active) showPhoto(null)
        // Avoid hiding the entire account page because of a photo problem.
      })

    return () => { active = false }
  }, [accessToken, reloadKey, showPhoto])

  const refresh = () => {
    setNotice(null)
    setPageState('loading')
    setReloadKey((value) => value + 1)
  }

  /** Save only the name; email changes need separate verification. */
  const handleSaveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!accessToken || !profile || busy) return
    const cleanName = name.trim().replace(/\s+/g, ' ')
    if (!cleanName || cleanName.length > 100) {
      setNotice({ type: 'error', text: 'Please enter a name between 1 and 100 characters.' })
      return
    }

    setBusy('name')
    setNotice(null)
    try {
      const updated = await saveProfileName(accessToken, cleanName)
      setProfile(updated)
      setName(updated.name)
      updateUser(updated)
      setEditing(false)
      setNotice({ type: 'success', text: 'Your name has been updated successfully.' })
    } catch (error) {
      setNotice({ type: 'error', text: readableError(error, 'We could not update your name. Please try again.') })
    } finally {
      setBusy(null)
    }
  }

  /** Validate the file before uploading it to the signed-in user's account. */
  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0]
    event.target.value = '' // Let people select the same file again if needed.
    if (!photo || !accessToken || busy) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
      setNotice({ type: 'error', text: 'Please choose a JPG, PNG, or WebP photo.' })
      return
    }
    if (photo.size === 0 || photo.size > 2 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'Please choose a photo smaller than 2 MB.' })
      return
    }

    setBusy('photo')
    setNotice(null)
    try {
      await saveProfilePhoto(accessToken, photo)
      // Display the photo immediately after the upload succeeds.
      // Opening Profile again will load the saved photo from the server.
      showPhoto(photo)
      setNotice({ type: 'success', text: 'Your profile photo has been saved.' })
    } catch (error) {
      setNotice({ type: 'error', text: readableError(error, 'We could not save your photo. Please try again.') })
    } finally {
      setBusy(null)
    }
  }

  const handleRemovePhoto = async () => {
    if (!accessToken || busy) return
    setBusy('remove')
    setNotice(null)
    try {
      await deleteProfilePhoto(accessToken)
      showPhoto(null)
      setNotice({ type: 'success', text: 'Your profile photo has been removed.' })
    } catch (error) {
      setNotice({ type: 'error', text: readableError(error, 'We could not remove your photo. Please try again.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="tf-profile-page">
      <div className="tf-profile-heading">
        <div>
          <p className="tf-profile-kicker">YOUR WORKSPACE</p>
          <h1>My profile</h1>
          <p>Make your workspace yours. Update your name or add a profile photo.</p>
        </div>
        <button type="button" className="tf-profile-refresh" onClick={refresh}
          disabled={pageState === 'loading' || busy !== null}>
          <Icon name="refresh" size={17}/>
          {pageState === 'loading' ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {notice && (
        <div className={`tf-profile-message tf-profile-message--${notice.type}`}
          role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite">
          <Icon name={notice.type === 'success' ? 'check' : 'shield'} size={19}/>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
        </div>
      )}

      {pageState === 'loading' && (
        <div className="tf-profile-state" role="status">
          <span className="tf-profile-loader" aria-hidden="true" />
          <strong>Getting your profile ready</strong>
          <p>Just a moment while we load your details.</p>
        </div>
      )}

      {pageState === 'error' && (
        <div className="tf-profile-state tf-profile-state--error" role="alert">
          <span className="tf-profile-state-symbol"><Icon name="shield" size={24}/></span>
          <strong>We couldn't open your profile</strong>
          <p>{pageError}</p>
          <button type="button" className="tf-profile-primary" onClick={refresh}>
            Try again <Icon name="arrow" size={17}/>
          </button>
        </div>
      )}

      {pageState === 'ready' && profile && (
        <>
          <section className="tf-profile-hero" aria-labelledby="profile-name-heading">
            <div className="tf-profile-hero-copy">
              <span className="tf-profile-hero-eyebrow"><Icon name="check" size={14}/> YOUR TASKFLOW ACCOUNT</span>
              <div className="tf-profile-hero-identity">
                {/* Keep the small initials badge beside the account name.
                    The uploaded photo is displayed in the large circle on the right. */}
                <span className="tf-profile-avatar tf-profile-avatar--photo-initials" aria-hidden="true">
                  {initials(profile.name)}
                </span>
                <div>
                  <h2 id="profile-name-heading">{profile.name}</h2>
                  <p>{profile.email}</p>
                  <div className="tf-profile-photo-controls">
                    <input ref={uploadInputRef} className="tf-profile-file-input" type="file"
                      accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo"
                      onChange={(event) => { void handlePhotoSelected(event) }} />
                    <button type="button" className="tf-profile-photo-button"
                      onClick={() => uploadInputRef.current?.click()} disabled={busy !== null}>
                      <Icon name="camera" size={16}/>
                      {busy === 'photo' ? 'Saving photo...' : photoUrl ? 'Change photo' : 'Add photo'}
                    </button>
                    {photoUrl && (
                      <button type="button" className="tf-profile-photo-remove"
                        onClick={() => { void handleRemovePhoto() }} disabled={busy !== null}>
                        <Icon name="trash" size={15}/> {busy === 'remove' ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p className="tf-profile-hero-note">JPG, PNG or WebP. Maximum size: 2 MB.</p>
            </div>
            {/* Large profile photo on the right, replacing the user icon when uploaded. */}
            <div className="tf-profile-hero-shape" aria-hidden="true">
              <span className="tf-profile-hero-ring" />
              {photoUrl ? (
                <img src={photoUrl} alt="" className="tf-profile-hero-photo" />
              ) : (
                <span className="tf-profile-hero-photo-placeholder">
                  <Icon name="user" size={64} />
                </span>
              )}
            </div>
          </section>

          <div className="tf-profile-layout">
            <section className="tf-profile-card" aria-labelledby="profile-details-heading">
              <div className="tf-profile-section-heading">
                <div>
                  <p className="tf-profile-kicker">PERSONAL DETAILS</p>
                  <h2 id="profile-details-heading">Your information</h2>
                  <p>You can change your name whenever you like.</p>
                </div>
                {!editing && (
                  <button type="button" className="tf-profile-edit-button"
                    onClick={() => { setEditing(true); setNotice(null) }}>
                    <Icon name="edit" size={16}/> Edit profile
                  </button>
                )}
              </div>

              <form onSubmit={(event) => { void handleSaveName(event) }}>
                <dl className="tf-profile-information">
                  <div className="tf-profile-information-row">
                    <dt><span><Icon name="user" size={18}/></span>Full name</dt>
                    <dd>
                      {editing ? (
                        <input id="tf-profile-name" className="tf-profile-name-input"
                          aria-label="Full name" autoComplete="name" maxLength={100}
                          value={name} onChange={(event) => setName(event.target.value)}
                          required disabled={busy !== null}/>
                      ) : profile.name}
                    </dd>
                  </div>
                  <div className="tf-profile-information-row">
                    <dt><span><Icon name="mail" size={18}/></span>Email address</dt>
                    <dd>{profile.email}</dd>
                  </div>
                  <div className="tf-profile-information-row">
                    <dt><span><Icon name="calendar" size={18}/></span>Member since</dt>
                    <dd>{memberSince(profile.createdAt)}</dd>
                  </div>
                </dl>
                {editing && (
                  <div className="tf-profile-edit-actions">
                    <button type="button" className="tf-profile-edit-cancel"
                      onClick={() => { setName(profile.name); setEditing(false); setNotice(null) }}
                      disabled={busy !== null}>Cancel</button>
                    <button type="submit" className="tf-profile-primary" disabled={busy !== null}>
                      {busy === 'name' ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                )}
              </form>
              <p className="tf-profile-readonly-note">Your email address cannot be changed here yet.</p>
            </section>

            <div className="tf-profile-side-column">
              <section className="tf-profile-card tf-profile-access" aria-labelledby="profile-access-heading">
                <div className="tf-profile-section-heading">
                  <div>
                    <p className="tf-profile-kicker">ACCOUNT STATUS</p>
                    <h2 id="profile-access-heading">You're all set</h2>
                  </div>
                  <span className="tf-profile-section-icon"><Icon name="shield"/></span>
                </div>
                <div className="tf-profile-status">
                  <span className="tf-profile-status-dot" aria-hidden="true"/>
                  <div>
                    <strong>Signed in</strong>
                    <p>You're signed in and ready to use TaskFlow.</p>
                  </div>
                </div>
                <div className="tf-profile-privacy">
                  <Icon name="shield" size={18}/>
                  <p>Your account details are private and available only when you're signed in.</p>
                </div>
              </section>

              <section className="tf-profile-card tf-profile-shortcuts" aria-labelledby="profile-shortcuts-heading">
                <div className="tf-profile-section-heading">
                  <div>
                    <p className="tf-profile-kicker">QUICK LINKS</p>
                    <h2 id="profile-shortcuts-heading">Your workspace</h2>
                  </div>
                </div>
                <Link to="/tasks" className="tf-profile-shortcut">
                  <span className="tf-profile-shortcut-icon"><Icon name="tasks"/></span>
                  <span>Manage my tasks</span>
                  <Icon name="arrow" size={17}/>
                </Link>
                <Link to="/dashboard" className="tf-profile-shortcut">
                  <span className="tf-profile-shortcut-icon"><Icon name="arrow"/></span>
                  <span>Back to overview</span>
                  <Icon name="arrow" size={17}/>
                </Link>
              </section>
            </div>
          </div>

          {/* Account security stays on the Profile page. No changes to the dashboard shell. */}
          <ChangePasswordSection accessToken={accessToken} />
        </>
      )}
    </div>
  )
}
