
import {
  useState,
  type FormEvent,
} from 'react'

import { useNavigate } from 'react-router'

import { useAuth } from '../hooks/useAuth'

/**
 * TaskFlow Login Page
 *
 * Professional, responsive authentication interface.
 * Submits credentials to the real NestJS backend.
 */
export default function LoginPage() {
  const navigate = useNavigate()

  // Access the shared authentication provider.
  const { signIn } = useAuth()

  // Controlled input values.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // User interface state.
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  /**
   * Authenticate the user.
   *
   * On success:
   * - Store authentication state in React memory.
   * - Redirect to the protected dashboard.
   *
   * On failure:
   * - Show an accessible error message.
   */
  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await signIn({
        email: email.trim().toLowerCase(),
        password,
      })

      navigate('/dashboard', {
        replace: true,
      })
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to sign in. Please try again.'

      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      {/* Left: Product branding and introduction. */}
      <section
        className="auth-hero"
        aria-label="About TaskFlow"
      >
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            ✓
          </span>
          <span>TaskFlow</span>
        </div>

        <div className="hero-content">
          <span className="hero-kicker">
            YOUR PRODUCTIVITY WORKSPACE
          </span>

          <h1>
            Make progress.
            <br />
            Every single day.
          </h1>

          <p className="hero-description">
            Bring your tasks together, stay organized,
            and focus on what matters most.
          </p>

          {/* Static design preview, not live task data. */}
          <div className="task-preview">
            <div className="preview-header">
              <h2>Today's priorities</h2>
              <span>Preview</span>
            </div>

            <div className="preview-item">
              <span className="task-check completed">
                ✓
              </span>

              <div className="preview-details">
                <strong>Organize your workspace</strong>
                <span>Getting started</span>
              </div>

              <span className="task-status">
                Done
              </span>
            </div>

            <div className="preview-item">
              <span className="task-check" />

              <div className="preview-details">
                <strong>Plan your next milestone</strong>
                <span>Upcoming task</span>
              </div>
            </div>
          </div>
        </div>

        <p className="hero-footer">
          Less clutter. More clarity. Better results.
        </p>
      </section>

      {/* Right: Real authentication form. */}
      <section
        className="auth-panel"
        aria-labelledby="login-title"
      >
        <div className="auth-form-container">
          {/* Branding visible on tablet and mobile. */}
          <div className="mobile-brand">
            <span className="brand-icon" aria-hidden="true">
              ✓
            </span>
            <span>TaskFlow</span>
          </div>

          <span className="form-kicker">
            WELCOME BACK
          </span>

          <h2 id="login-title">
            Sign in to your account
          </h2>

          <p className="form-description">
            Enter your details to continue to your workspace.
          </p>

          <form
            className="login-form"
            onSubmit={handleSubmit}
            aria-busy={isSubmitting}
          >
            {/* Email input. */}
            <div className="form-group">
              <label htmlFor="login-email">
                Email address
              </label>

              <input
                id="login-email"
                type="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setErrorMessage('')
                }}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Password input and visibility control. */}
            <div className="form-group">
              <label htmlFor="login-password">
                Password
              </label>

              <div className="password-field">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setErrorMessage('')
                  }}
                  disabled={isSubmitting}
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => {
                    setShowPassword((previous) => !previous)
                  }}
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Real login submission button. */}
            <button
              type="submit"
              className="login-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                'Signing in...'
              ) : (
                <>
                  Sign in
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>

            {/* Accessible authentication errors. */}
            {errorMessage && (
              <p
                className="form-feedback form-error"
                role="alert"
              >
                {errorMessage}
              </p>
            )}
          </form>

          <p className="registration-note">
  New to TaskFlow?{' '}
  <a href="/register" className="signup-inline-link">
    Sign up
  </a>
</p>
        </div>

        <p className="auth-footer">
          TaskFlow — Work smarter, stay organized.
        </p>
      </section>
    </main>
  )
}
