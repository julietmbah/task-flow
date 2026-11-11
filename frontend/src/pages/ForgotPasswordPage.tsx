import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { requestPasswordReset } from '../services/authApi'
import RecoveryAuthLayout from './RecoveryAuthLayout'

const GENERIC_CONFIRMATION =
  'If an account exists for that email, a password reset link will be sent.'

/** Public recovery page; never reveals which email addresses have accounts. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSending) return

    setMessage('')
    setErrorMessage('')
    setIsSending(true)

    try {
      await requestPasswordReset(email)
      setMessage(GENERIC_CONFIRMATION)
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We couldn’t send the request right now. Please try again.',
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <RecoveryAuthLayout
      kicker="ACCOUNT RECOVERY"
      title="Forgot your password?"
      description="Enter the email address linked to your TaskFlow account. We'll send you a secure link to choose a new password."
      titleId="forgot-password-title"
    >
      <form className="login-form recovery-form" onSubmit={handleSubmit} aria-busy={isSending}>
        <div className="form-group">
          <label htmlFor="recovery-email">Email address</label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setMessage('')
              setErrorMessage('')
            }}
            required
            disabled={isSending}
            autoFocus
          />
        </div>

        <button className="login-button" type="submit" disabled={isSending}>
          {isSending ? 'Sending link…' : 'Send reset link'}
        </button>

        {message && (
          <div className="form-feedback recovery-success" role="status" aria-live="polite">
            <strong>Check your inbox</strong>
            <p>{message}</p>
            <p>Also check your Spam or Junk folder. The link expires after 15 minutes.</p>
          </div>
        )}
        {errorMessage && <p className="form-feedback form-error" role="alert">{errorMessage}</p>}
      </form>

      <p className="registration-note recovery-back-row">
        <Link to="/login" className="auth-text-link">← Back to sign in</Link>
      </p>
    </RecoveryAuthLayout>
  )
}
