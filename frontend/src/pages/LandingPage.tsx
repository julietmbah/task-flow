import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'

type Theme = 'light' | 'dark'
type IconName = 'check' | 'arrow' | 'arrow-up' | 'sun' | 'moon' | 'menu' | 'close' | 'spark' | 'layers' | 'search' | 'shield' | 'chart' | 'calendar' | 'clock' | 'bolt' | 'filter' | 'check-circle'

interface LandingPageProps {
  theme: Theme
  onToggleTheme: () => void
}

function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  switch (name) {
    case 'check': return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>
    case 'arrow': return <svg {...common}><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
    case 'arrow-up': return <svg {...common}><path d="M7 17 17 7M8 7h9v9" /></svg>
    case 'sun': return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
    case 'moon': return <svg {...common}><path d="M20.4 15.4A8.7 8.7 0 0 1 8.6 3.6 8.8 8.8 0 1 0 20.4 15.4Z" /></svg>
    case 'menu': return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    case 'close': return <svg {...common}><path d="M5 5 19 19M19 5 5 19" /></svg>
    case 'spark': return <svg {...common}><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" /></svg>
    case 'layers': return <svg {...common}><path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5" /></svg>
    case 'search': return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
    case 'shield': return <svg {...common}><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></svg>
    case 'chart': return <svg {...common}><path d="M4 20V4m0 16h16M8 16v-4m5 4V8m5 8V5" /></svg>
    case 'calendar': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-12 5 2 2 4-4" /></svg>
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    case 'bolt': return <svg {...common}><path d="m13 2-9 12h7l-1 8 10-13h-7V2Z" /></svg>
    case 'filter': return <svg {...common}><path d="M4 6h16M7 12h10m-7 6h4" /></svg>
    case 'check-circle': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
  }
  return null
}

const previewTasks = {
  today: [
    { text: 'Review project priorities', tag: 'Completed', state: 'done' },
    { text: 'Organize upcoming tasks', tag: 'Completed', state: 'done' },
    { text: 'Prepare your next milestone', tag: 'In progress', state: 'active' },
  ],
  week: [
    { text: 'Create your weekly plan', tag: 'Completed', state: 'done' },
    { text: 'Update project milestones', tag: 'In progress', state: 'active' },
    { text: 'Review your task list', tag: 'To do', state: 'pending' },
  ],
} as const

const features: { icon: IconName; title: string; description: string; emphasis?: boolean }[] = [
  { icon: 'layers', title: 'Everything in one place', description: 'Keep your tasks organized in one clear workspace instead of juggling scattered notes.', emphasis: true },
  { icon: 'chart', title: 'Progress at a glance', description: 'See what is complete, what is underway, and what still needs your attention.' },
  { icon: 'search', title: 'Find tasks fast', description: 'Search, filter, sort, and move through your task list without losing focus.' },
  { icon: 'calendar', title: 'Plan with intention', description: 'Make room for priorities, deadlines, and the work that matters most.' },
  { icon: 'bolt', title: 'A calmer workflow', description: 'Create, update, and manage tasks through a clean, straightforward experience.' },
  { icon: 'shield', title: 'Your personal space', description: 'Sign in securely, update your profile, and recover account access when needed.' },
]

export default function LandingPage({ theme, onToggleTheme }: LandingPageProps) {
  const { isAuthenticated } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<'today' | 'week'>('today')
  const actionPath = isAuthenticated ? '/dashboard' : '/register'
  const actionLabel = isAuthenticated ? 'Open my workspace' : 'Get started free'

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'TaskFlow — A clearer way to get things done'
    return () => { document.title = previousTitle }
  }, [])

  function closeMenu() { setMenuOpen(false) }

  return (
    <div className="tf-landing" id="top">
      <a className="lp-skip" href="#main-content">Skip to content</a>
      <header className="lp-header">
        <div className="lp-container lp-nav-inner">
          <Link to="/" className="lp-brand" aria-label="TaskFlow homepage" onClick={closeMenu}>
            <span className="lp-brand-mark"><Icon name="check" size={22} /></span>
            <span>Task<span className="lp-brand-gradient">Flow</span></span>
          </Link>
          <nav className={`lp-nav ${menuOpen ? 'lp-nav-open' : ''}`} aria-label="Primary navigation" id="lp-nav">
            <a href="#features" onClick={closeMenu}>Features</a>
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#faq" onClick={closeMenu}>FAQs</a>
            <div className="lp-mobile-actions">
              <Link to="/login" className="lp-mobile-signin" onClick={closeMenu}>Sign in</Link>
              <Link to={actionPath} className="lp-btn lp-btn-primary" onClick={closeMenu}>{actionLabel} <Icon name="arrow" size={17} /></Link>
            </div>
          </nav>
          <div className="lp-header-actions">
            <button type="button" className="lp-theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} aria-pressed={theme === 'dark'}>
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={19} />
            </button>
            <Link to={isAuthenticated ? '/dashboard' : '/login'} className="lp-header-login">{isAuthenticated ? 'Dashboard' : 'Sign in'}</Link>
            <Link to={actionPath} className="lp-btn lp-btn-primary lp-header-cta">{actionLabel} <Icon name="arrow" size={17} /></Link>
            <button type="button" className="lp-mobile-toggle" aria-controls="lp-nav" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen((current) => !current)}>
              <Icon name={menuOpen ? 'close' : 'menu'} size={23} />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="lp-hero" aria-labelledby="lp-hero-heading">
          <div className="lp-hero-glow lp-hero-glow-a" aria-hidden="true" />
          <div className="lp-hero-glow lp-hero-glow-b" aria-hidden="true" />
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <div className="lp-eyebrow"><span className="lp-eyebrow-star"><Icon name="spark" size={14} /></span> YOUR SPACE TO MAKE PROGRESS <span className="lp-eyebrow-line" /></div>
              <h1 id="lp-hero-heading">Less chaos.<br /><span>More clarity.</span><br />Better progress.</h1>
              <p className="lp-hero-description">Meet your calmer way to get things done. Plan your tasks, stay on top of priorities, and build momentum—one meaningful step at a time.</p>
              <div className="lp-hero-actions">
                <Link to={actionPath} className="lp-btn lp-btn-primary lp-btn-large">{actionLabel} <Icon name="arrow" size={19} /></Link>
                <a className="lp-btn lp-btn-outline lp-btn-large" href="#how-it-works">See how it works <Icon name="arrow-up" size={17} /></a>
              </div>
              <div className="lp-hero-notes" aria-label="TaskFlow benefits">
                <span><Icon name="check-circle" size={16} /> Easy to get started</span>
                <span><Icon name="check-circle" size={16} /> Built for everyday focus</span>
              </div>
            </div>

            <div className="lp-hero-visual" aria-label="Illustrative preview of a TaskFlow workspace">
              <div className="lp-floating-label lp-float-top" aria-hidden="true"><span className="lp-floating-check"><Icon name="check" size={14} /></span> A little progress adds up</div>
              <div className="lp-preview-frame">
                <div className="lp-preview-topbar">
                  <div className="lp-preview-brand"><span className="lp-preview-symbol"><Icon name="check" size={15}/></span> TaskFlow <span className="lp-preview-topbar-label">/ My workspace</span></div>
                  <span className="lp-preview-avatar" aria-hidden="true">JD</span>
                </div>
                <div className="lp-preview-body">
                  <div className="lp-preview-heading">
                    <div><p className="lp-preview-eyebrow">YOUR WORKSPACE</p><h2>Let's make progress <span>✳</span></h2><p>A clear picture of what matters today.</p></div>
                    <span className="lp-preview-pill"><span /> On track</span>
                  </div>
                  <div className="lp-preview-stats">
                    <div className="lp-preview-stat"><span>All tasks</span><strong>12</strong><small>On your list</small></div>
                    <div className="lp-preview-stat"><span>In progress</span><strong>4</strong><small>Keep it going</small></div>
                    <div className="lp-preview-stat"><span>Completed</span><strong>8</strong><small>Nicely done!</small></div>
                  </div>
                  <div className="lp-preview-grid">
                    <div className="lp-preview-card lp-preview-tasks">
                      <div className="lp-preview-card-head"><strong>My priorities</strong><span className="lp-preview-list-icon"><Icon name="filter" size={15} /></span></div>
                      <div className="lp-preview-tabs" role="group" aria-label="Choose sample task preview">
                        <button type="button" onClick={() => setPreviewMode('today')} aria-pressed={previewMode === 'today'} className={previewMode === 'today' ? 'active' : ''}>Today</button>
                        <button type="button" onClick={() => setPreviewMode('week')} aria-pressed={previewMode === 'week'} className={previewMode === 'week' ? 'active' : ''}>This week</button>
                      </div>
                      <div className="lp-preview-task-list">
                        {previewTasks[previewMode].map((task) => <div className="lp-preview-task" key={task.text}>
                          <span className={`lp-preview-task-check ${task.state === 'done' ? 'is-done' : ''}`} aria-hidden="true">{task.state === 'done' ? <Icon name="check" size={11} /> : null}</span>
                          <span className="lp-preview-task-name">{task.text}</span>
                          <span className={`lp-preview-tag lp-preview-tag-${task.state}`}>{task.tag}</span>
                        </div>)}
                      </div>
                    </div>
                    <div className="lp-preview-card lp-preview-progress" style={{ display: 'flex' }}>
                      <div className="lp-preview-card-head"><strong>Weekly focus</strong><Icon name="chart" size={17}/></div>
                      <div className="lp-preview-donut"><div><strong>67%</strong><span>complete</span></div></div>
                      <div className="lp-preview-progress-caption"><span><i /> Done</span><span>8 of 12</span></div>
                      <p>You're moving forward. Keep it up!</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lp-floating-label lp-float-bottom" aria-hidden="true"><span className="lp-float-spark"><Icon name="bolt" size={15}/></span> One step at a time</div>
              <p className="lp-preview-disclaimer">Illustrative preview · Your tasks stay personal</p>
            </div>
          </div>
          <div className="lp-container lp-hero-bottom"><span>BUILT FOR A MORE FOCUSED DAY</span><span className="lp-hero-bottom-rule" /><a href="#features">Explore the features <Icon name="arrow" size={16}/></a></div>
        </section>

        <section className="lp-section lp-features" id="features" aria-labelledby="lp-features-title">
          <div className="lp-container">
            <div className="lp-section-heading lp-section-heading-centered"><span className="lp-section-kicker">SIMPLE BY DESIGN</span><h2 id="lp-features-title">Everything you need.<br /><span>Nothing in your way.</span></h2><p>More than a to-do list—TaskFlow gives your day structure without making work feel complicated.</p></div>
            <div className="lp-feature-grid">
              {features.map((feature, index) => <article className={`lp-feature-card ${feature.emphasis ? 'lp-feature-featured' : ''}`} key={feature.title}>
                <div className="lp-feature-icon"><Icon name={feature.icon} size={23}/></div>
                {index === 0 ? <span className="lp-feature-tag">MADE FOR CLARITY</span> : null}
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                {feature.emphasis ? <div className="lp-feature-progress" aria-hidden="true"><div><span>Project priorities</span><span>On track</span></div><div className="lp-feature-progress-track"><span /></div><div className="lp-feature-progress-dots"><i /><i /><i /></div></div> : null}
              </article>)}
            </div>
          </div>
        </section>

        <section className="lp-section lp-how" id="how-it-works" aria-labelledby="lp-how-title">
          <div className="lp-container lp-how-layout">
            <div className="lp-how-intro"><span className="lp-section-kicker">YOUR NEXT STEP STARTS HERE</span><h2 id="lp-how-title">A little structure goes a long way.</h2><p>No complicated setup. Just a simple place to turn what you need to do into meaningful progress.</p><Link to={actionPath} className="lp-inline-link">{actionLabel} <Icon name="arrow" size={18}/></Link></div>
            <div className="lp-steps">
              <article className="lp-step"><div className="lp-step-number">01</div><div><h3>Make it yours</h3><p>Create your account and step into a workspace designed around your day.</p></div><Icon name="arrow-up" size={19}/></article>
              <article className="lp-step"><div className="lp-step-number">02</div><div><h3>Get organized</h3><p>Add your tasks, keep priorities visible, and find what you need quickly.</p></div><Icon name="arrow-up" size={19}/></article>
              <article className="lp-step"><div className="lp-step-number">03</div><div><h3>Keep moving</h3><p>Update your progress, celebrate small wins, and focus on what's next.</p></div><Icon name="check-circle" size={19}/></article>
            </div>
          </div>
        </section>

        <section className="lp-section lp-faq" id="faq" aria-labelledby="lp-faq-title">
          <div className="lp-container lp-faq-layout">
            <div className="lp-section-heading"><span className="lp-section-kicker">GOOD TO KNOW</span><h2 id="lp-faq-title">Questions? <span>We've got answers.</span></h2><p>A few helpful things to know before you get started.</p></div>
            <div className="lp-faq-list">
              <details><summary>Can I use TaskFlow on my phone or tablet?<span>+</span></summary><p>Yes. TaskFlow is designed to adapt to phones, tablets, and desktop screens, so you can manage your work wherever you are.</p></details>
              <details><summary>Can I switch between light and dark mode?<span>+</span></summary><p>Absolutely. Use the theme button in the navigation to switch modes. TaskFlow remembers your preference on this device.</p></details>
              <details><summary>What if I forget my password?<span>+</span></summary><p>Use the “Forgot password?” link on the sign-in page. You can verify your email and securely create a new password.</p></details>
              <details><summary>Do I need to install anything?<span>+</span></summary><p>No installation is needed. Open TaskFlow in a browser, create an account, and start organizing your tasks.</p></details>
            </div>
          </div>
        </section>

        <section className="lp-section lp-final-cta" aria-labelledby="lp-final-title"><div className="lp-container"><div className="lp-final-inner"><div className="lp-final-glow" aria-hidden="true" /><span className="lp-final-eyebrow"><Icon name="spark" size={16}/> YOUR NEXT CHAPTER OF FOCUS</span><h2 id="lp-final-title">Ready to make room for<br />what matters?</h2><p>Less noise. More momentum. It starts with your next task.</p><div className="lp-final-actions"><Link to={actionPath} className="lp-btn lp-final-button">{actionLabel}<Icon name="arrow" size={18}/></Link><Link to={isAuthenticated ? '/dashboard' : '/login'} className="lp-final-signin">{isAuthenticated ? 'Go to dashboard' : 'Already have an account? Sign in'} <Icon name="arrow-up" size={15}/></Link></div></div></div></section>
      </main>

      <footer className="lp-footer"><div className="lp-container lp-footer-inner"><Link className="lp-brand lp-footer-brand" to="/" aria-label="TaskFlow homepage"><span className="lp-brand-mark"><Icon name="check" size={19}/></span><span>Task<span className="lp-brand-gradient">Flow</span></span></Link><p>Make progress. Every single day.</p><div className="lp-footer-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><Link to="/login">Sign in</Link></div><span className="lp-footer-copyright">© {new Date().getFullYear()} TaskFlow</span></div></footer>
    </div>
  )
}
