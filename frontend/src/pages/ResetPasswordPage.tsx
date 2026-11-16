import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { resetPasswordWithToken } from '../services/authApi'
import RecoveryAuthLayout from './RecoveryAuthLayout'

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i

// These checks exactly mirror the NestJS reset-password rules.
function checkPassword(password: string) {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'One number (0-9)', met: /[0-9]/.test(password) },
    { label: 'One symbol (such as _ @ # !)', met: /[\p{P}\p{S}]/u.test(password) },
  ]
}

/** The token arrives in the URL fragment, not in an HTTP request. */
function getTokenFromFragment(): string {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return params.get('token') ?? ''
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="m10 15 1.5 1.5L14.5 13.5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {visible ? (
        <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>
      ) : (
        <><path d="M4 4l16 16M10.5 6.1a11 11 0 0 1 1.5-.1c6.5 0 10 6 10 6a15.8 15.8 0 0 1-3.2 3.6M6.3 7.5C3.4 9.3 2 12 2 12s3.5 6 10 6c1.1 0 2.1-.2 3-.5" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /></>
      )}
    </svg>
  )
}

/** Professional account recovery screen, with live password guidance. */
export default function ResetPasswordPage() {
  const [token] = useState(getTokenFromFragment)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const hasValidToken = TOKEN_PATTERN.test(token)
  const rules = checkPassword(newPassword)
  const metCount = rules.filter((rule) => rule.met).length
  const tooLong = new TextEncoder().encode(newPassword).length > 72
  const meetsRequirements = metCount === rules.length && !tooLong
  const hasConfirmation = confirmPassword.length > 0
  const passwordsMatch = hasConfirmation && newPassword === confirmPassword

  useEffect(() => {
    // Keep sensitive reset tokens out of browser history and copied URLs.
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || isComplete || !hasValidToken) return

    setErrorMessage('')
    if (tooLong) {
      setErrorMessage('Your password is too long. Please choose a shorter one.')
      return
    }
    if (!meetsRequirements) {
      setErrorMessage('Please meet all the password requirements shown below.')
      return
    }
    if (!passwordsMatch) {
      setErrorMessage('Your passwords do not match. Please check and try again.')
      return
    }

    setIsSaving(true)
    try {
      await resetPasswordWithToken(token, newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setIsComplete(true)
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We could not reset your password. Please try again.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <RecoveryAuthLayout
      kicker="ACCOUNT RECOVERY"
      title={isComplete ? 'Password updated!' : 'Create a new password'}
      description={
        isComplete
          ? 'You are all set. Sign in with your new password to continue.'
          : 'Choose a secure password to get back into your TaskFlow account.'
      }
      titleId="reset-password-title"
    >
      {isComplete ? (
        <div className="reset-status-card reset-status-success" role="status">
          <span className="reset-status-mark"><CheckIcon /></span>
          <h3>Your password is ready</h3>
          <p>Your password has been changed successfully. Your tasks and profile are just as you left them.</p>
          <Link className="login-button recovery-button-link" to="/login">Back to sign in <span aria-hidden="true">→</span></Link>
        </div>
      ) : !hasValidToken ? (
        <div className="reset-status-card" role="alert">
          <span className="reset-status-mark reset-status-alert"><LockIcon /></span>
          <h3>This link cannot be used</h3>
          <p>The link is missing, expired, or invalid. Please request a new one.</p>
          <Link className="login-button recovery-button-link" to="/forgot-password">Request a new link</Link>
        </div>
      ) : (
        <div className="reset-card">
          <div className="reset-card-heading">
            <span className="reset-lock-icon"><LockIcon /></span>
            <div>
              <p className="reset-card-eyebrow">SECURE YOUR ACCOUNT</p>
              <h3>A fresh start, securely.</h3>
              <p>Create a password that is different from your old one.</p>
            </div>
          </div>

          <form className="login-form reset-form" onSubmit={handleSubmit} aria-busy={isSaving}>
            <div className="form-group reset-form-group">
              <label htmlFor="reset-new-password">New password</label>
              <div className="password-field reset-password-input">
                <input
                  id="reset-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  name="newPassword"
                  autoComplete="new-password"
                  value={newPassword}
                  placeholder="Create your new password"
                  onChange={(event) => { setNewPassword(event.target.value); setErrorMessage('') }}
                  aria-describedby="reset-password-guidance"
                  aria-invalid={Boolean(newPassword && (!meetsRequirements))}
                  disabled={isSaving}
                  required
                  autoFocus
                />
                <button className="password-toggle reset-eye-button" type="button"
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  aria-pressed={showNewPassword}
                  disabled={isSaving}
                  onClick={() => setShowNewPassword((visible) => !visible)}>
                  <EyeIcon visible={showNewPassword} />
                </button>
              </div>
            </div>

            <section className="reset-guidance" id="reset-password-guidance" aria-label="Password requirements">
              <div className="reset-guidance-heading">
                <span>Password requirements</span>
                <span className="reset-guidance-count">{metCount} of {rules.length} met</span>
              </div>
              <div className="reset-progress" role="progressbar" aria-label="Password requirements met"
                aria-valuemin={0} aria-valuemax={rules.length} aria-valuenow={metCount}>
                <span style={{ width: `${(metCount / rules.length) * 100}%` }} />
              </div>
              <ul className="reset-rules">
                {rules.map((rule) => (
                  <li className={rule.met ? 'reset-rule met' : 'reset-rule'} key={rule.label}>
                    <span className="reset-rule-icon" aria-hidden="true">{rule.met ? <CheckIcon /> : '·'}</span>
                    {rule.label}
                  </li>
                ))}
              </ul>
              {tooLong && <p className="reset-length-warning" role="alert">Your password is too long. Try a shorter one.</p>}
              <p className="reset-symbol-examples">You can use symbols such as <strong>_ @ # ! $ % & *</strong>.</p>
            </section>

            <div className="form-group reset-form-group">
              <label htmlFor="reset-confirm-password">Confirm new password</label>
              <div className="password-field reset-password-input">
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  placeholder="Re-enter your new password"
                  onChange={(event) => { setConfirmPassword(event.target.value); setErrorMessage('') }}
                  aria-describedby={hasConfirmation ? 'reset-match-message' : undefined}
                  aria-invalid={hasConfirmation && !passwordsMatch}
                  disabled={isSaving}
                  required
                />
                <button className="password-toggle reset-eye-button" type="button"
                  aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                  aria-pressed={showConfirmPassword}
                  disabled={isSaving}
                  onClick={() => setShowConfirmPassword((visible) => !visible)}>
                  <EyeIcon visible={showConfirmPassword} />
                </button>
              </div>
              {hasConfirmation && (
                <p className={passwordsMatch ? 'reset-match matches' : 'reset-match'} id="reset-match-message" aria-live="polite">
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match yet'}
                </p>
              )}
            </div>

            {errorMessage && <p className="form-feedback form-error" role="alert">{errorMessage}</p>}
            <button className="login-button reset-submit" type="submit" disabled={isSaving}>
              {isSaving ? 'Updating password…' : 'Save new password'}
              {!isSaving && <span aria-hidden="true">→</span>}
            </button>
            <p className="reset-privacy-note"><LockIcon /> Your new password stays private and is saved securely.</p>
          </form>
        </div>
      )}

      {!isComplete && (
        <p className="registration-note recovery-back-row">
          <Link to="/login" className="auth-text-link">← Back to sign in</Link>
        </p>
      )}
    </RecoveryAuthLayout>
  )
}
