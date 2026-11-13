import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'

import { registerUser } from '../services/authApi'
import type { RegisterRequest } from '../types/auth'

/**
 * TaskFlow — RegisterPage
 *
 * This page uses the existing POST /auth/register endpoint.
 * Registration does not sign the user in: the backend returns public user
 * information, so the next step is to sign in with the new credentials.
 *
 * All styling lives in src/index.css. No new UI library is required.
 */
interface RegisterForm {
  name: string
  email: string
  password: string
  confirmPassword: string
}

type RegisterField = keyof RegisterForm
type RegisterErrors = Partial<Record<RegisterField, string>>

interface RegisteredAccount {
  name: string
  email: string
}

const INITIAL_FORM: RegisterForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
}

/** Client-side checks improve UX; NestJS remains the source of validation. */
function validateRegistration(form: RegisterForm): RegisterErrors {
  const errors: RegisterErrors = {}

  if (form.name.trim().length < 2) {
    errors.name = 'Enter your name (at least 2 characters).'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (form.password.length < 8) {
    errors.password = 'Your password must have at least 8 characters.'
  }

  if (!form.confirmPassword) {
    errors.confirmPassword = 'Confirm your password to continue.'
  } else if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Passwords do not match yet.'
  }

  return errors
}

type RegisterIconName =
  | 'check'
  | 'arrow'
  | 'arrow-up-right'
  | 'lock'
  | 'list'
  | 'calendar'
  | 'chart'
  | 'sparkle'
  | 'mail'
  | 'shield'

/** Small inline icons keep the page self-contained and dependency-free. */
const iconPaths: Record<RegisterIconName, ReactNode> = {
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  list: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m7.5 10 1.5 1.5 2.5-3M13 10h4m-9.5 5H17" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 10h18" />
    </>
  ),
  chart: <path d="M4 19V11m5 8V5m5 14v-7m5 7V8M2 20h20" />,
  sparkle: (
    <>
      <path d="m12 2 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
      <path d="m19 16 .6 1.4L21 18l-1.4.6L19 20l-.6-1.4L17 18l1.4-.6L19 16Z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
}

function RegisterIcon({
  name,
  size = 20,
}: {
  name: RegisterIconName
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  )
}

/** A shared left panel is shown on large screens, including after signup. */
function RegisterIntro({ completed }: { completed: boolean }) {
  return (
    <aside className="signup-aside" aria-label="About TaskFlow">
      <div className="signup-aside-glow" aria-hidden="true" />

      <Link className="signup-brand signup-brand--light" to="/login">
        <span className="signup-brand-mark" aria-hidden="true">
          <RegisterIcon name="check" size={22} />
        </span>
        <span className="signup-brand-text">
          <strong>TaskFlow</strong>
          <small>YOUR WORKSPACE</small>
        </span>
      </Link>

      <div className="signup-aside-content">
        <div className="signup-aside-label">
          <RegisterIcon name="sparkle" size={16} />
          A BETTER WAY TO GET THINGS DONE
        </div>

        <h1>
          {completed ? (
            <>Your next chapter <em>starts here.</em></>
          ) : (
            <>Less clutter. <em>More clarity.</em></>
          )}
        </h1>

        <p>
          A thoughtful space for your plans, priorities, and progress.
          Everything you need to move work forward, one task at a time.
        </p>

        {/* This is an illustrative feature list, not fabricated user data. */}
        <div className="signup-workflow" aria-label="What you can do with TaskFlow">
          <div className="signup-workflow-item">
            <span className="signup-workflow-icon signup-workflow-icon--violet">
              <RegisterIcon name="list" size={20} />
            </span>
            <div>
              <strong>Plan with purpose</strong>
              <span>Give every task a clear place.</span>
            </div>
            <RegisterIcon name="check" size={17} />
          </div>
          <div className="signup-workflow-item">
            <span className="signup-workflow-icon signup-workflow-icon--blue">
              <RegisterIcon name="calendar" size={20} />
            </span>
            <div>
              <strong>Stay ahead of deadlines</strong>
              <span>Know what needs attention next.</span>
            </div>
            <RegisterIcon name="check" size={17} />
          </div>
          <div className="signup-workflow-item">
            <span className="signup-workflow-icon signup-workflow-icon--mint">
              <RegisterIcon name="chart" size={20} />
            </span>
            <div>
              <strong>See your progress</strong>
              <span>Celebrate the work you've finished.</span>
            </div>
            <RegisterIcon name="check" size={17} />
          </div>
        </div>
      </div>

      <div className="signup-aside-footer">
        <span className="signup-footer-line" aria-hidden="true" />
        Your day, beautifully organized.
      </div>
    </aside>
  )
}

/** A non-misleading next-step indicator: account created, then sign in. */
function RegistrationSuccess({ account }: { account: RegisteredAccount }) {
  const firstName = account.name.trim().split(/\s+/)[0] || 'there'

  return (
    <section className="signup-success" aria-labelledby="signup-success-title" aria-live="polite">
      <div className="signup-success-celebration" aria-hidden="true">
        <div className="signup-success-halo">
          <span className="signup-success-mark">
            <RegisterIcon name="check" size={34} />
          </span>
        </div>
        <span className="signup-confetti signup-confetti--one" />
        <span className="signup-confetti signup-confetti--two" />
        <span className="signup-confetti signup-confetti--three" />
        <span className="signup-confetti signup-confetti--four" />
      </div>

      <span className="signup-success-eyebrow">
        <RegisterIcon name="check" size={14} /> Account created successfully
      </span>

      <h2 id="signup-success-title">Welcome to TaskFlow, {firstName}!</h2>
      <p className="signup-success-lead">
        Your workspace is ready. You're just one sign-in away from
        organizing your day with confidence.
      </p>

      <div className="signup-account-summary">
        <span className="signup-account-avatar" aria-hidden="true">
          {firstName.charAt(0).toUpperCase()}
        </span>
        <div>
          <span className="signup-account-caption">YOUR NEW ACCOUNT</span>
          <strong>{account.name}</strong>
          <span className="signup-account-email">{account.email}</span>
        </div>
        <span className="signup-account-verified" title="Account created successfully">
          <RegisterIcon name="check" size={18} />
        </span>
      </div>

      <div className="signup-next-step">
        <span className="signup-next-step-kicker">WHAT'S NEXT?</span>
        <div className="signup-step">
          <span className="signup-step-icon signup-step-icon--done"><RegisterIcon name="check" size={16} /></span>
          <div><strong>Account created</strong><small>Registration complete</small></div>
          <span className="signup-step-badge">Done</span>
        </div>
        <div className="signup-step signup-step--current">
          <span className="signup-step-icon">2</span>
          <div><strong>Sign in to your workspace</strong><small>Use your new email and password</small></div>
          <RegisterIcon name="arrow" size={17} />
        </div>
      </div>

      <Link className="signup-submit signup-submit-link" to="/login">
        Continue to sign in
        <RegisterIcon name="arrow" size={19} />
      </Link>
      <p className="signup-success-footnote">
        <RegisterIcon name="lock" size={14} /> Your password is never displayed or saved on this page.
      </p>
    </section>
  )
}

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [serverError, setServerError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registeredAccount, setRegisteredAccount] = useState<RegisteredAccount | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  /** Update only the edited field and clear its prior validation error. */
  const updateField = (field: RegisterField, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
    setServerError('')
  }

  /** Create the account through the existing backend API service. */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const validationErrors = validateRegistration(form)
    setErrors(validationErrors)
    setServerError('')
    if (Object.keys(validationErrors).length > 0) return

    const registration: RegisterRequest = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
    }

    setIsSubmitting(true)

    try {
      const created = await registerUser(registration)

      // Keep public account details only. Remove password from React state.
      setRegisteredAccount({
        name: created.name || registration.name,
        email: created.email || registration.email,
      })
      setForm(INITIAL_FORM)
      setShowPassword(false)
      setShowConfirmation(false)
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : 'Unable to create your account. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="signup-shell">
      <RegisterIntro completed={registeredAccount !== null} />

      <main className="signup-panel">
        <div className="signup-panel-inner">
          <header className="signup-panel-top">
            <Link className="signup-brand signup-brand--mobile" to="/login">
              <span className="signup-brand-mark" aria-hidden="true">
                <RegisterIcon name="check" size={20} />
              </span>
              <span className="signup-brand-text"><strong>TaskFlow</strong><small>YOUR WORKSPACE</small></span>
            </Link>
            <div className="signup-header-signin">
              <span>{registeredAccount ? 'Ready to begin?' : 'Already have an account?'}</span>
              <Link to="/login">Sign in <RegisterIcon name="arrow-up-right" size={14} /></Link>
            </div>
          </header>

          {registeredAccount ? (
            <RegistrationSuccess account={registeredAccount} />
          ) : (
            <section className="signup-form-section" aria-labelledby="signup-title">
              <div className="signup-form-heading">
                <span className="signup-form-kicker"><RegisterIcon name="sparkle" size={15} /> START YOUR JOURNEY</span>
                <h2 id="signup-title">Create your account</h2>
                <p className="signup-intro">A little setup today. A more organized tomorrow.</p>
              </div>

              <form className="signup-form" onSubmit={handleSubmit} noValidate>
                <div className="signup-field">
                  <label htmlFor="signup-name">Full name</label>
                  <input
                    id="signup-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Juliet Mbah"
                    value={form.name}
                    maxLength={100}
                    onChange={(event) => updateField('name', event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'signup-name-error' : undefined}
                    disabled={isSubmitting}
                    required
                  />
                  {errors.name && <p id="signup-name-error" className="signup-field-error" role="alert">{errors.name}</p>}
                </div>

                <div className="signup-field">
                  <label htmlFor="signup-email">Email address</label>
                  <input
                    id="signup-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'signup-email-error' : undefined}
                    disabled={isSubmitting}
                    required
                  />
                  {errors.email && <p id="signup-email-error" className="signup-field-error" role="alert">{errors.email}</p>}
                </div>

                <div className="signup-field">
                  <label htmlFor="signup-password">Password</label>
                  <div className="signup-input-with-action">
                    <input
                      id="signup-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={form.password}
                      onChange={(event) => updateField('password', event.target.value)}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? 'signup-password-error' : 'signup-password-help'}
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="button"
                      className="signup-reveal"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {errors.password ? (
                    <p id="signup-password-error" className="signup-field-error" role="alert">{errors.password}</p>
                  ) : (
                    <p id="signup-password-help" className="signup-field-hint">Use at least 8 characters.</p>
                  )}
                </div>

                <div className="signup-field">
                  <label htmlFor="signup-confirm">Confirm password</label>
                  <div className="signup-input-with-action">
                    <input
                      id="signup-confirm"
                      name="confirmPassword"
                      type={showConfirmation ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Enter your password again"
                      value={form.confirmPassword}
                      onChange={(event) => updateField('confirmPassword', event.target.value)}
                      aria-invalid={Boolean(errors.confirmPassword)}
                      aria-describedby={errors.confirmPassword ? 'signup-confirm-error' : undefined}
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="button"
                      className="signup-reveal"
                      aria-label={showConfirmation ? 'Hide confirmed password' : 'Show confirmed password'}
                      aria-pressed={showConfirmation}
                      onClick={() => setShowConfirmation((current) => !current)}
                    >
                      {showConfirmation ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p id="signup-confirm-error" className="signup-field-error" role="alert">{errors.confirmPassword}</p>
                  )}
                </div>

                {serverError && <div className="signup-server-error" role="alert">{serverError}</div>}

                <button className="signup-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><span className="signup-button-spinner" aria-hidden="true" /> Creating your account…</>
                  ) : (
                    <>Create your account <RegisterIcon name="arrow" size={19} /></>
                  )}
                </button>
              </form>

              <p className="signup-login-prompt">
                Already part of TaskFlow? <Link to="/login">Sign in instead</Link>
              </p>
              <p className="signup-security-note">
                <RegisterIcon name="shield" size={16} /> Your information is handled securely.
              </p>
            </section>
          )}

          <p className="signup-bottom-note">© TaskFlow · Plan better. Do more.</p>
        </div>
      </main>
    </div>
  )
}
