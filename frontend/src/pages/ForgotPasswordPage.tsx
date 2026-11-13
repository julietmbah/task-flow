import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { requestPasswordReset } from '../services/authApi'
import RecoveryAuthLayout from './RecoveryAuthLayout'

/** Start the recovery flow without disclosing whether an account exists. */
export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSending) return

    setErrorMessage('')
    setIsSending(true)

    try {
      const address = email.trim().toLowerCase()
      await requestPasswordReset(address)
      navigate('/verify-password-otp', {
        state: { email: address, requestedAt: Date.now() },
      })
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We couldn’t send your code right now. Please try again.',
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <RecoveryAuthLayout
      kicker="ACCOUNT RECOVERY · STEP 1 OF 3"
      title="Forgot your password?"
      description="Enter the email address linked to your TaskFlow account. We'll send a six-digit verification code to your inbox."
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
              setErrorMessage('')
            }}
            required
            disabled={isSending}
            autoFocus
          />
        </div>

        {errorMessage && (
          <p className="form-feedback form-error" role="alert">{errorMessage}</p>
        )}

        <button className="login-button" type="submit" disabled={isSending}>
          {isSending ? 'Sending code…' : 'Send verification code'}
          {!isSending && <span aria-hidden="true">→</span>}
        </button>
        <p className="recovery-password-hint">
          For your security, verification codes expire after 10 minutes.
        </p>
      </form>

      <p className="registration-note recovery-back-row">
        <Link to="/login" className="auth-text-link">← Back to sign in</Link>
      </p>
    </RecoveryAuthLayout>
  )
}
