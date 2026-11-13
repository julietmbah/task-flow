import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router'

import { resendPasswordOtp, verifyPasswordOtp } from '../services/authApi'
import RecoveryAuthLayout from './RecoveryAuthLayout'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_MS = 60_000

interface RecoveryLocationState {
  email: string
  requestedAt: number
}

function readLocationState(value: unknown): RecoveryLocationState | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('email' in value) || typeof value.email !== 'string') return null
  if (!('requestedAt' in value) || typeof value.requestedAt !== 'number') return null
  if (!Number.isFinite(value.requestedAt)) return null
  return { email: value.email, requestedAt: value.requestedAt }
}

function blankCode() {
  return Array<string>(CODE_LENGTH).fill('')
}

function secondsUntil(timestamp: number) {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

/** Verify an email code before the server sends a one-time password reset link. */
export default function VerifyPasswordOtpPage() {
  const location = useLocation()
  const recoveryState = readLocationState(location.state)
  const [email, setEmail] = useState(() => recoveryState?.email ?? '')
  const [code, setCode] = useState<string[]>(blankCode)
  const [resendAvailableAt, setResendAvailableAt] = useState(
    () => recoveryState ? recoveryState.requestedAt + RESEND_COOLDOWN_MS : 0,
  )
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    secondsUntil(recoveryState ? recoveryState.requestedAt + RESEND_COOLDOWN_MS : 0),
  )
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [verified, setVerified] = useState(false)
  const [notice, setNotice] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!resendAvailableAt) return
    const interval = window.setInterval(() => {
      setSecondsRemaining(secondsUntil(resendAvailableAt))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [resendAvailableAt])

  const normalizedEmail = email.trim().toLowerCase()
  const enteredCode = code.join('')
  const busy = isVerifying || isResending

  function updateCode(index: number, value: string) {
    const numbers = value.replace(/\D/g, '')
    if (!numbers) {
      setCode((previous) => previous.map((digit, position) => position === index ? '' : digit))
      setErrorMessage('')
      return
    }

    setCode((previous) => {
      const next = [...previous]
      for (let position = 0; position < numbers.length && index + position < CODE_LENGTH; position++) {
        next[index + position] = numbers[position]
      }
      return next
    })
    setErrorMessage('')
    setNotice('')
    inputRefs.current[Math.min(index + numbers.length, CODE_LENGTH - 1)]?.focus()
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    event.preventDefault()
    updateCode(index, event.clipboardData.getData('text'))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      event.preventDefault()
      setCode((previous) => previous.map((digit, position) => position === index - 1 ? '' : digit))
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || verified) return
    setErrorMessage('')
    setNotice('')
    if (!normalizedEmail || !/^[0-9]{6}$/.test(enteredCode)) {
      setErrorMessage('Please enter your email and the complete six-digit code.')
      return
    }

    setIsVerifying(true)
    try {
      await verifyPasswordOtp(normalizedEmail, enteredCode)
      setVerified(true)
      setCode(blankCode())
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We couldn’t check your code. Please try again.',
      )
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResend() {
    if (busy || verified || secondsRemaining > 0) return
    if (!normalizedEmail) {
      setErrorMessage('Enter your email address first.')
      return
    }

    setIsResending(true)
    setErrorMessage('')
    setNotice('')
    try {
      await resendPasswordOtp(normalizedEmail)
      setCode(blankCode())
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS)
      setSecondsRemaining(60)
      setNotice('If an account exists for this email, a new code is on its way. Please check your inbox.')
      inputRefs.current[0]?.focus()
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We couldn’t resend the code right now. Please try again.',
      )
    } finally {
      setIsResending(false)
    }
  }

  return (
    <RecoveryAuthLayout
      kicker="ACCOUNT RECOVERY · STEP 2 OF 3"
      title={verified ? 'Check your inbox' : 'Verify your email'}
      description={verified
        ? 'Your code was verified. We have sent a secure link to help you create a new password.'
        : 'Enter the six-digit code from your email to continue resetting your password.'}
      titleId="verify-password-otp-title"
    >
      {verified ? (
        <section className="otp-card otp-complete" role="status" aria-live="polite">
          <div className="otp-success-mark" aria-hidden="true">✓</div>
          <h3>Verification successful</h3>
          <p>Open the newest password reset email we sent to <strong>{normalizedEmail}</strong>.</p>
          <p>Click the link to open your existing Create New Password page. The link expires after 15 minutes and works only once.</p>
          <p className="otp-help-text">Can't see it? Check your Spam or Junk folder.</p>
          <Link to="/login" className="login-button recovery-button-link">Back to sign in</Link>
        </section>
      ) : (
        <div className="otp-card">
          <div className="otp-card-header">
            <span className="otp-mail-icon" aria-hidden="true">
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 7 8 6 8-6" />
              </svg>
            </span>
            <div>
              <p className="otp-eyebrow">EMAIL VERIFICATION</p>
              <h3>Enter your security code</h3>
              {recoveryState ? (
                <p>Check <strong>{normalizedEmail}</strong> for your code, if the address is registered.</p>
              ) : (
                <p>Enter your email and the code you received.</p>
              )}
            </div>
          </div>

          <form className="login-form otp-form" onSubmit={handleVerify} aria-busy={busy}>
            {!recoveryState && (
              <div className="form-group">
                <label htmlFor="otp-email">Email address</label>
                <input
                  id="otp-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  required
                  value={email}
                  disabled={busy}
                  onChange={(event) => { setEmail(event.target.value); setErrorMessage('') }}
                  autoFocus
                />
              </div>
            )}

            <fieldset className="otp-fieldset" disabled={busy}>
              <legend>Six-digit verification code</legend>
              <div className="otp-input-row" aria-label="Enter your six-digit verification code">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => { inputRefs.current[index] = element }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus={Boolean(recoveryState) && index === 0}
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                    aria-invalid={Boolean(errorMessage)}
                    maxLength={index === 0 ? CODE_LENGTH : 1}
                    value={digit}
                    onChange={(event) => updateCode(index, event.target.value)}
                    onPaste={(event) => handlePaste(event, index)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                  />
                ))}
              </div>
            </fieldset>
            <p className="otp-help-text">The code expires after 10 minutes. You can paste all six digits at once.</p>

            {notice && <div className="form-feedback recovery-success" role="status">{notice}</div>}
            {errorMessage && <p className="form-feedback form-error" role="alert">{errorMessage}</p>}

            <button className="login-button otp-verify-button" type="submit" disabled={busy || enteredCode.length !== CODE_LENGTH || !normalizedEmail}>
              {isVerifying ? 'Verifying…' : 'Verify and send reset link'}
              {!isVerifying && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <div className="otp-resend">
            <span>Didn't receive your code?</span>
            <button
              type="button"
              className="otp-resend-button"
              disabled={busy || secondsRemaining > 0}
              onClick={handleResend}
            >
              {isResending
                ? 'Sending…'
                : secondsRemaining > 0
                  ? `Resend in ${secondsRemaining}s`
                  : 'Resend code'}
            </button>
          </div>
          <p className="otp-help-text otp-spam-note">Check your Spam or Junk folder if you don't see the email.</p>
        </div>
      )}

      {!verified && (
        <p className="registration-note recovery-back-row">
          <Link to="/forgot-password" className="auth-text-link">← Use a different email</Link>
        </p>
      )}
      <p className="registration-note otp-signin-row">
        <Link to="/login" className="auth-text-link">Back to sign in</Link>
      </p>
    </RecoveryAuthLayout>
  )
}
