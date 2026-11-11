import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * Matches the existing TaskFlow login's hero, panel and mobile branding.
 * Styling continues to live entirely in src/index.css.
 */
interface RecoveryAuthLayoutProps {
  kicker: string
  title: string
  description: string
  titleId: string
  children: ReactNode
}

export default function RecoveryAuthLayout({
  kicker, title, description, titleId, children,
}: RecoveryAuthLayoutProps) {
  return (
    <main className="auth-shell">
      <section className="auth-hero" aria-label="About TaskFlow">
        <Link to="/login" className="brand" aria-label="TaskFlow home">
          <span className="brand-icon" aria-hidden="true">✓</span>
          <span>TaskFlow</span>
        </Link>

        <div className="hero-content">
          <span className="hero-kicker">YOUR PRODUCTIVITY WORKSPACE</span>
          <h1>Make progress.<br />Every single day.</h1>
          <p className="hero-description">
            Bring your tasks together, stay organized,
            and focus on what matters most.
          </p>
          <div className="task-preview" aria-hidden="true">
            <div className="preview-header">
              <h2>Today's priorities</h2>
              <span>Preview</span>
            </div>
            <div className="preview-item">
              <span className="task-check completed">✓</span>
              <div className="preview-details">
                <strong>Organize your workspace</strong>
                <span>Getting started</span>
              </div>
              <span className="task-status">Done</span>
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

        <p className="hero-footer">Less clutter. More clarity. Better results.</p>
      </section>

      <section className="auth-panel" aria-labelledby={titleId}>
        <div className="auth-form-container">
          <Link to="/login" className="mobile-brand" aria-label="TaskFlow home">
            <span className="brand-icon" aria-hidden="true">✓</span>
            <span>TaskFlow</span>
          </Link>
          <span className="form-kicker">{kicker}</span>
          <h2 id={titleId}>{title}</h2>
          <p className="form-description">{description}</p>
          {children}
        </div>
        <p className="auth-footer">TaskFlow — Work smarter, stay organized.</p>
      </section>
    </main>
  )
}
