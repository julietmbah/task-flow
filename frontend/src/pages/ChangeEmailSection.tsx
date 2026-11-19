import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import {
  requestChangeEmailOtp,
  resendChangeEmailOtp,
  verifyChangeEmailOtp,
} from '../services/profileApi'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_MS = 60_000
const OTP_LIFETIME_MS = 10 * 60_000

type BusyAction = 'request' | 'resend' | 'verify' | null

type Notice = { type: 'success' | 'error'; text: string } | null

interface ChangeEmailSectionProps {
  accessToken: string | null
  currentEmail: string
  onVerified: (email: string) => void
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Signed-in email change. Never updates the current email until the server has
 * verified the six-digit code sent to the pending new address.
 */
export default function ChangeEmailSection({ accessToken, currentEmail, onVerified }: ChangeEmailSectionProps) {
  const [step, setStep] = useState<'request' | 'verify'>('request')
  const [newEmail, setNewEmail] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''))
  const [issuedAt, setIssuedAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (step !== 'verify') return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [step])

  const resendSeconds = issuedAt
    ? Math.max(0, Math.ceil((issuedAt + RESEND_COOLDOWN_MS - now) / 1000))
    : 0
  const expirySeconds = issuedAt
    ? Math.max(0, Math.ceil((issuedAt + OTP_LIFETIME_MS - now) / 1000))
    : 0
  const expired = step === 'verify' && issuedAt > 0 && expirySeconds === 0
  const code = digits.join('')

  const resetDigits = () => setDigits(Array(CODE_LENGTH).fill(''))

  function changeDigit(index: number, raw: string) {
    const numbers = raw.replace(/\D/g, '')
    setDigits((previous) => {
      const next = [...previous]
      if (!numbers) {
        next[index] = ''
      } else {
        for (let position = 0; position < numbers.length && index + position < CODE_LENGTH; position++) {
          next[index + position] = numbers[position]
        }
      }
      return next
    })
    setNotice(null)
    if (numbers) inputRefs.current[Math.min(index + numbers.length, CODE_LENGTH - 1)]?.focus()
  }

  function pasteDigits(event: ClipboardEvent<HTMLInputElement>, index: number) {
    event.preventDefault()
    changeDigit(index, event.clipboardData.getData('text'))
  }

  function handleDigitKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      setDigits((previous) => previous.map((digit, position) => position === index - 1 ? '' : digit))
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !accessToken) return
    const cleanEmail = newEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setNotice({ type: 'error', text: 'Enter a valid new email address.' })
      return
    }
    if (cleanEmail === currentEmail.toLowerCase()) {
      setNotice({ type: 'error', text: 'Please choose an email address different from your current one.' })
      return
    }
    setBusy('request')
    setNotice(null)
    try {
      const result = await requestChangeEmailOtp(accessToken, cleanEmail)
      const timestamp = Date.now()
      setPendingEmail(result.newEmail)
      setIssuedAt(timestamp)
      setNow(timestamp)
      resetDigits()
      setStep('verify')
      setNotice({ type: 'success', text: 'Code sent. Check your new email inbox or Spam folder.' })
    } catch (error: unknown) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not send a verification code. Try again.') })
    } finally {
      setBusy(null)
    }
  }

  async function handleResend() {
    if (busy || !accessToken || step !== 'verify' || resendSeconds > 0) return
    setBusy('resend')
    setNotice(null)
    try {
      await resendChangeEmailOtp(accessToken)
      const timestamp = Date.now()
      setIssuedAt(timestamp)
      setNow(timestamp)
      resetDigits()
      setNotice({ type: 'success', text: 'A new code was sent. Check your new email and use the latest code.' })
      inputRefs.current[0]?.focus()
    } catch (error: unknown) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not resend the code. Try again.') })
    } finally {
      setBusy(null)
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !accessToken || step !== 'verify') return
    if (expired) {
      setNotice({ type: 'error', text: 'This code has expired. Select Resend code to get a new one.' })
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setNotice({ type: 'error', text: 'Enter the complete six-digit code from your new email.' })
      return
    }
    setBusy('verify')
    setNotice(null)
    try {
      const result = await verifyChangeEmailOtp(accessToken, code)
      onVerified(result.email)
      setNewEmail('')
      setPendingEmail('')
      resetDigits()
      setIssuedAt(0)
      setStep('request')
      setNotice({ type: 'success', text: 'Your email address has been changed successfully.' })
    } catch (error: unknown) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not verify the code. Try again.') })
    } finally {
      setBusy(null)
    }
  }

  function changePendingAddress() {
    if (busy) return
    setStep('request')
    setNewEmail(pendingEmail)
    resetDigits()
    setNotice(null)
  }

  return (
    <section className="tf-profile-card tf-change-email" aria-labelledby="tf-change-email-heading">
      <div className="tf-profile-section-heading">
        <div>
          <p className="tf-profile-kicker">ACCOUNT SECURITY</p>
          <h2 id="tf-change-email-heading">Change email address</h2>
          <p>Verify your new email address before we update your account.</p>
        </div>
        <span className="tf-profile-section-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
          </svg>
        </span>
      </div>

      {notice && (
        <div className={`tf-change-email-notice tf-change-email-notice--${notice.type}`}
          role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
        </div>
      )}

      {step === 'request' ? (
        <form onSubmit={(event) => { void handleRequest(event) }}>
          <div className="tf-change-email-current">
            <span>Current email</span><strong>{currentEmail}</strong>
          </div>
          <label className="tf-change-email-label" htmlFor="tf-change-email-new">New email address</label>
          <input id="tf-change-email-new" className="tf-change-email-input"
            autoComplete="email" type="email" inputMode="email" maxLength={254}
            value={newEmail} onChange={(event) => setNewEmail(event.target.value)}
            placeholder="Enter your new email" required disabled={busy !== null || !accessToken}/>
          <p className="tf-change-email-help">We'll send a six-digit verification code to this address. Your current email stays active until verification succeeds.</p>
          <button className="tf-profile-primary tf-change-email-submit" type="submit" disabled={busy !== null || !accessToken}>
            {busy === 'request' && <span className="tf-change-email-spinner" aria-hidden="true" />}
            {busy === 'request' ? 'Sending code…' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <div>
          <div className="tf-change-email-sent-to">
            <span>Verification code sent to</span>
            <strong>{pendingEmail}</strong>
            <button type="button" onClick={changePendingAddress} disabled={busy !== null}>Use another email</button>
          </div>
          <form onSubmit={(event) => { void handleVerify(event) }}>
            <span id="tf-change-email-otp-label" className="tf-change-email-label">Enter your six-digit code</span>
            <div className="tf-change-email-digits" role="group" aria-labelledby="tf-change-email-otp-label">
              {digits.map((digit, index) => (
                <input key={index} ref={(element) => { inputRefs.current[index] = element }}
                  aria-label={`Code digit ${index + 1}`} className="tf-change-email-digit" type="text"
                  inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  pattern="[0-9]*" maxLength={6} value={digit}
                  onChange={(event) => changeDigit(index, event.target.value)}
                  onPaste={(event) => pasteDigits(event, index)}
                  onKeyDown={(event) => handleDigitKey(event, index)}
                  disabled={busy !== null || expired} />
              ))}
            </div>
            <p className={`tf-change-email-timer${expired ? ' tf-change-email-timer--expired' : ''}`} role="status">
              {expired
                ? 'Your code has expired. Select Resend code to request a new one.'
                : `Your verification code expires in ${formatTime(expirySeconds)}.`}
            </p>
            <button className="tf-profile-primary tf-change-email-submit" type="submit"
              disabled={busy !== null || expired || code.length !== CODE_LENGTH}>
              {busy === 'verify' && <span className="tf-change-email-spinner" aria-hidden="true" />}
              {busy === 'verify' ? 'Verifying…' : 'Verify and change email'}
            </button>
          </form>
          <div className="tf-change-email-resend">
            <span>Didn't receive the code?</span>
            <button type="button" onClick={() => { void handleResend() }}
              disabled={busy !== null || resendSeconds > 0}>
              {busy === 'resend' && <span className="tf-change-email-spinner" aria-hidden="true" />}
              {busy === 'resend' ? 'Sending…' : resendSeconds > 0 ? `Resend code (${formatTime(resendSeconds)})` : 'Resend code'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
