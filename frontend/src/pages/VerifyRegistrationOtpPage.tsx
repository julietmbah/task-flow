import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router'

import { resendRegistrationOtp, verifyRegistrationOtp } from '../services/authApi'
import RecoveryAuthLayout from './RecoveryAuthLayout'

const CODE_LENGTH = 6
const OTP_LIFETIME_MS = 10 * 60_000
const RESEND_COOLDOWN_MS = 60_000

function formatCountdown(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

interface RegistrationState {
  email: string
  requestedAt: number
  name?: string
}

function readRegistrationState(value: unknown): RegistrationState | null {
  if (!value || typeof value !== 'object') return null
  if (!('email' in value) || typeof value.email !== 'string') return null
  if (!('requestedAt' in value) || typeof value.requestedAt !== 'number') return null
  if (!Number.isFinite(value.requestedAt)) return null
  const name = 'name' in value && typeof value.name === 'string' ? value.name : undefined
  return { email: value.email, requestedAt: value.requestedAt, name }
}

function makeCode(): string[] { return Array<string>(CODE_LENGTH).fill('') }

/** Registration email verification is separate from password recovery. */
export default function VerifyRegistrationOtpPage() {
  const location = useLocation()
  const registration = readRegistrationState(location.state)
  const [email, setEmail] = useState(() => registration?.email ?? '')
  const [digits, setDigits] = useState<string[]>(makeCode)
  const [issuedAt, setIssuedAt] = useState(() => registration?.requestedAt ?? 0)
  const [issuedForEmail, setIssuedForEmail] = useState(() => registration?.email.trim().toLowerCase() ?? '')
  const [now, setNow] = useState(Date.now)
  const [busyAction, setBusyAction] = useState<'verify' | 'resend' | null>(null)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const normalizedEmail = email.trim().toLowerCase()
  const code = digits.join('')
  const busy = busyAction !== null
  const hasActiveTimer = issuedAt > 0 && normalizedEmail === issuedForEmail
  const resendSeconds = hasActiveTimer ? Math.max(0, Math.ceil((issuedAt + RESEND_COOLDOWN_MS - now) / 1000)) : 0
  const expirySeconds = hasActiveTimer ? Math.max(0, Math.ceil((issuedAt + OTP_LIFETIME_MS - now) / 1000)) : 0
  const expired = hasActiveTimer && expirySeconds === 0

  function setDigit(index: number, value: string) {
    const numbers = value.replace(/\D/g, '')
    if (!numbers) {
      setDigits(previous => previous.map((digit, i) => i === index ? '' : digit))
    } else {
      setDigits(previous => {
        const next = [...previous]
        for (let i = 0; i < numbers.length && index + i < CODE_LENGTH; i++) next[index + i] = numbers[i]
        return next
      })
      inputRefs.current[Math.min(CODE_LENGTH - 1, index + numbers.length)]?.focus()
    }
    setError('')
    setNotice('')
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    event.preventDefault()
    setDigit(index, event.clipboardData.getData('text'))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      setDigits(previous => previous.map((digit, i) => i === index - 1 ? '' : digit))
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
    setError('')
    setNotice('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter the email address you used to register.')
      return
    }
    if (expired) {
      setError('This code has expired. Select Resend code to request another one.')
      return
    }
    if (!/^[0-9]{6}$/.test(code)) {
      setError('Enter all six digits from the verification email.')
      return
    }
    setBusyAction('verify')
    try {
      await verifyRegistrationOtp(normalizedEmail, code)
      setVerified(true)
      setDigits(makeCode())
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not verify your code. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleResend() {
    if (busy || verified || resendSeconds > 0) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter the email address you used to register.')
      return
    }
    setBusyAction('resend')
    setError('')
    setNotice('')
    try {
      await resendRegistrationOtp(normalizedEmail)
      setDigits(makeCode())
      const timestamp = Date.now()
      setIssuedAt(timestamp)
      setIssuedForEmail(normalizedEmail)
      setNow(timestamp)
      setNotice('If a new code was sent, check your inbox or Spam folder. Use the newest code you receive.')
      inputRefs.current[0]?.focus()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not request a new code. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <RecoveryAuthLayout
      kicker="CREATE AN ACCOUNT · STEP 2 OF 2"
      title={verified ? 'Email verified!' : 'Verify your email'}
      description={verified
        ? 'Your TaskFlow account is now active. You can sign in with the password you created.'
        : 'Enter the six-digit code we sent to the email you registered with.'}
      titleId="verify-registration-otp-title"
    >
      {verified ? (
        <section className="otp-card otp-complete" role="status" aria-live="polite">
          <div className="otp-success-mark" aria-hidden="true">✓</div>
          <h3>Your account is ready</h3>
          <p>We've verified <strong>{normalizedEmail}</strong>. Welcome to TaskFlow!</p>
          <p>Your password stays the same. You can now access your workspace.</p>
          <Link to="/login" className="login-button recovery-button-link">Continue to sign in →</Link>
        </section>
      ) : (
        <div className="otp-card registration-otp-card">
          <div className="otp-card-header">
            <span className="otp-mail-icon" aria-hidden="true">
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 7 8 6 8-6" />
              </svg>
            </span>
            <div>
              <p className="otp-eyebrow">SECURE EMAIL CONFIRMATION</p>
              <h3>Enter your verification code</h3>
              <p>Use the code from the newest TaskFlow registration email.</p>
            </div>
          </div>

          <form className="login-form otp-form" onSubmit={handleVerify} aria-busy={busy}>
            <div className="form-group">
              <label htmlFor="registration-otp-email">Registration email</label>
              <input
                id="registration-otp-email"
                type="email"
                name="email"
                autoComplete="email"
                maxLength={254}
                placeholder="you@example.com"
                value={email}
                onChange={event => { setEmail(event.target.value); setError(''); setNotice('') }}
                disabled={busy}
                required
              />
            </div>

            <fieldset className="otp-fieldset" disabled={busy}>
              <legend>Six-digit verification code</legend>
              <div className="otp-input-row">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={element => { inputRefs.current[index] = element }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${index + 1} of 6`}
                    aria-invalid={Boolean(error)}
                    autoFocus={Boolean(registration) && index === 0}
                    maxLength={index === 0 ? CODE_LENGTH : 1}
                    value={digit}
                    onChange={event => setDigit(index, event.target.value)}
                    onPaste={event => onPaste(event, index)}
                    onKeyDown={event => onKeyDown(event, index)}
                  />
                ))}
              </div>
            </fieldset>
            <p className={`registration-otp-expiry${expired ? ' otp-expired' : ''}`} role={expired ? 'status' : undefined}>
              {expired ? (
                <>Your verification code has <strong>expired.</strong> Select <strong>Resend code</strong> below to request a new one.</>
              ) : (
                <>Your verification code expires <strong>10 minutes after it is sent.</strong></>
              )}
            </p>
            {notice && <div className="form-feedback recovery-success" role="status">{notice}</div>}
            {error && <p className="form-feedback form-error" role="alert">{error}</p>}
            <button className="login-button otp-verify-button" type="submit" disabled={busy || expired || code.length !== 6 || !normalizedEmail}>
              {busyAction === 'verify' ? <><span className="otp-action-spinner" aria-hidden="true" /> Verifying code</> : <>Verify email & activate account <span aria-hidden="true">→</span></>}
            </button>
          </form>

          <div className="otp-resend">
            <span>Need another code?</span>
            <button type="button" className="otp-resend-button" onClick={handleResend} disabled={busy || resendSeconds > 0}>
              {busyAction === 'resend' ? (
                <><span className="otp-action-spinner" aria-hidden="true" /> Sending code</>
              ) : (
                <>Resend code{resendSeconds > 0 && <span className="otp-resend-count">({formatCountdown(resendSeconds)})</span>}</>
              )}
            </button>
          </div>
          <p className="otp-help-text otp-spam-note">Check Spam or Junk if you don't see the email. Only the newest code works after a successful resend.</p>
        </div>
      )}
      <p className="registration-note recovery-back-row">
        <Link to="/login" className="auth-text-link">← Back to sign in</Link>
      </p>
    </RecoveryAuthLayout>
  )
}
