import { useEffect, useState, type FormEvent } from 'react'

import { changeProfilePassword } from '../services/profileApi'

/**
 * TaskFlow — Change Password
 *
 * A self-contained section within My Profile.
 * Does not store passwords outside this component or in browser storage.
 * All styles are defined in src/index.css.
 */
interface ChangePasswordSectionProps {
  accessToken: string | null
}

type PasswordField = 'current' | 'new' | 'confirm'
type Notice = { kind: 'success' | 'error'; message: string } | null

/** Plain inline SVG so the project needs no additional icon library. */
function LockIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {visible ? (
        <>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M4 4l16 16M10.5 6.1a11 11 0 0 1 1.5-.1c6.5 0 10 6 10 6a15.8 15.8 0 0 1-3.2 3.6M6.3 7.5C3.4 9.3 2 12 2 12s3.5 6 10 6c1.1 0 2.1-.2 3-.5" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        </>
      )}
    </svg>
  )
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}

export default function ChangePasswordSection({ accessToken }: ChangePasswordSectionProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    new: false,
    confirm: false,
  })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  // Success messages disappear automatically; errors remain until dismissed.
  useEffect(() => {
    if (notice?.kind !== 'success') return
    const timeoutId = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const toggleVisible = (field: PasswordField) => {
    setVisible((previous) => ({ ...previous, [field]: !previous[field] }))
  }

  const resetForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setVisible({ current: false, new: false, confirm: false })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setNotice(null)

    if (!accessToken) {
      setNotice({ kind: 'error', message: 'Please sign in again to change your password.' })
      return
    }
    if (!currentPassword) {
      setNotice({ kind: 'error', message: 'Please enter your current password.' })
      return
    }
    if (utf8Length(currentPassword) > 72) {
      setNotice({ kind: 'error', message: 'Your current password is incorrect.' })
      return
    }
    if (Array.from(newPassword).length < 8) {
      setNotice({ kind: 'error', message: 'Choose a new password with at least 8 characters.' })
      return
    }
    if (utf8Length(newPassword) > 72) {
      setNotice({ kind: 'error', message: 'Your new password is too long. Please choose a shorter one.' })
      return
    }
    if (newPassword === currentPassword) {
      setNotice({ kind: 'error', message: 'Choose a new password that is different from your current one.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setNotice({ kind: 'error', message: 'Your new passwords do not match. Please try again.' })
      return
    }

    setSaving(true)
    try {
      await changeProfilePassword(accessToken, { currentPassword, newPassword })
      resetForm()
      setNotice({ kind: 'success', message: 'Your password has been changed successfully.' })
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error && error.message
          ? error.message
          : 'We could not change your password. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tf-profile-card tf-password-section" aria-labelledby="tf-password-heading">
      <div className="tf-password-header">
        <span className="tf-password-header-icon" aria-hidden="true"><LockIcon /></span>
        <div>
          <p className="tf-profile-kicker">ACCOUNT SECURITY</p>
          <h2 id="tf-password-heading">Change password</h2>
          <p>Keep your account safe by choosing a password that only you know.</p>
        </div>
      </div>

      {notice && (
        <div className={`tf-profile-message tf-profile-message--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Close message">×</button>
        </div>
      )}

      <form className="tf-password-form" onSubmit={(event) => { void submit(event) }} noValidate>
        <div className="tf-password-fields">
          <div className="tf-password-field">
            <label htmlFor="tf-current-password">Current password</label>
            <div className="tf-password-input-wrap">
              <input id="tf-current-password" type={visible.current ? 'text' : 'password'}
                autoComplete="current-password" value={currentPassword} required
                placeholder="Enter current password" disabled={saving}
                onChange={(event) => setCurrentPassword(event.target.value)} />
              <button type="button" disabled={saving} onClick={() => toggleVisible('current')}
                aria-label={visible.current ? 'Hide current password' : 'Show current password'}
                aria-pressed={visible.current}>
                <EyeIcon visible={visible.current} />
              </button>
            </div>
          </div>
          <div className="tf-password-field">
            <label htmlFor="tf-new-password">New password</label>
            <div className="tf-password-input-wrap">
              <input id="tf-new-password" type={visible.new ? 'text' : 'password'}
                autoComplete="new-password" value={newPassword} required minLength={8}
                placeholder="Create a new password" disabled={saving}
                onChange={(event) => setNewPassword(event.target.value)} />
              <button type="button" disabled={saving} onClick={() => toggleVisible('new')}
                aria-label={visible.new ? 'Hide new password' : 'Show new password'}
                aria-pressed={visible.new}>
                <EyeIcon visible={visible.new} />
              </button>
            </div>
            <p className="tf-password-help">At least 8 characters. Use a mix of letters, numbers, and symbols.</p>
          </div>
          <div className="tf-password-field">
            <label htmlFor="tf-confirm-password">Confirm new password</label>
            <div className="tf-password-input-wrap">
              <input id="tf-confirm-password" type={visible.confirm ? 'text' : 'password'}
                autoComplete="new-password" value={confirmPassword} required
                placeholder="Enter your new password again" disabled={saving}
                onChange={(event) => setConfirmPassword(event.target.value)} />
              <button type="button" disabled={saving} onClick={() => toggleVisible('confirm')}
                aria-label={visible.confirm ? 'Hide confirmation password' : 'Show confirmation password'}
                aria-pressed={visible.confirm}>
                <EyeIcon visible={visible.confirm} />
              </button>
            </div>
          </div>
        </div>

        <div className="tf-password-actions">
          <p>Your password won't be shown to anyone.</p>
          <button type="submit" className="tf-profile-primary tf-password-submit" disabled={saving || !accessToken}>
            {saving ? 'Updating password...' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  )
}
