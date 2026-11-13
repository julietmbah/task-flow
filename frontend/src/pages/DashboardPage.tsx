import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../hooks/useAuth'
import TasksPage from './TasksPage'
import DashboardOverview from './DashboardOverview'
import ProfilePage from './ProfilePage'

/**
 * TaskFlow dashboard
 *
 * - Displays real user information from the authentication provider.
 * - Keeps the light/dark toggle and Sign out visible in the top navbar.
 * - Uses a greeting based on the user's local time when the page opens.
 * - Uses only the global src/index.css stylesheet.
 */
interface DashboardPageProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

type IconName =
  | 'overview'
  | 'user'
  | 'tasks'
  | 'logout'
  | 'menu'
  | 'close'
  | 'arrow'
  | 'check'
  | 'sparkles'
  | 'calendar'
  | 'shield'
  | 'chevron'
  | 'mail'
  | 'chart'
  | 'sun'
  | 'moon'

/** Inline SVG icons avoid adding a separate icon dependency. */
const iconPaths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  tasks: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 9 1.5 1.5L12 8" />
      <path d="M14 10h3M8 16h9" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M5 5l14 14M19 5 5 19" />,
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  sparkles: (
    <>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="m19 17 .7 1.3L21 19l-1.3.7L19 21l-.7-1.3L17 19l1.3-.7L19 17Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </>
  ),
  moon: <path d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z" />,
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
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

/** Determine the greeting using the browser's local time. */
function getGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage({
  theme,
  onToggleTheme,
}: DashboardPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isTasksView = location.pathname === '/tasks'
  const isProfileView = location.pathname === '/profile'
  const isOverviewView = !isTasksView && !isProfileView
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Capture local time on dashboard mount (normally right after login).
  const [openedAt] = useState(() => new Date())

  // Start each workspace route at the top, preventing stale hash scrolling.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname])

  // ProtectedRoute normally blocks access without a user session.
  if (!user) return null

  const firstName = user.name.trim().split(/\s+/)[0] || 'there'
  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'TF'

  const greeting = getGreeting(openedAt)
  const today = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(openedAt)

  const accountCreatedAt = new Date(user.createdAt)
  const memberSince = Number.isNaN(accountCreatedAt.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: 'numeric',
      }).format(accountCreatedAt)

  const closeMenu = () => setMenuOpen(false)

  /** Clear in-memory authentication and navigate to login. */
  const handleLogout = () => {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-shell">
      {/* An overlay closes the sidebar on phones and tablets. */}
      {menuOpen && (
        <button
          type="button"
          className="dashboard-backdrop"
          aria-label="Close navigation menu"
          onClick={closeMenu}
        />
      )}

      {/* Colorful workspace sidebar. */}
      <aside
        id="taskflow-sidebar"
        className={`dashboard-sidebar${menuOpen ? ' dashboard-sidebar--open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <span className="sidebar-logo">
            <Icon name="check" size={23} />
          </span>
          <div>
            <strong>TaskFlow</strong>
            <small>YOUR WORKSPACE</small>
          </div>
        </div>

        <nav className="sidebar-navigation" aria-label="Workspace sections">
          <p className="sidebar-label">WORKSPACE</p>
          <Link
            to="/dashboard"
            className={`sidebar-link${isOverviewView ? ' sidebar-link--active' : ''}`}
            aria-current={isOverviewView ? 'page' : undefined}
            onClick={closeMenu}
          >
            <Icon name="overview" />
            <span>Overview</span>
          </Link>
          {/* Profile has its own route, rather than a dashboard anchor. */}
          <Link
            to="/profile"
            className={`sidebar-link${isProfileView ? ' sidebar-link--active' : ''}`}
            aria-current={isProfileView ? 'page' : undefined}
            onClick={closeMenu}
          >
            <Icon name="user" />
            <span>My profile</span>
          </Link>
          {/* My Tasks is now a protected, real-data route. */}
          <Link
            to="/tasks"
            className={`sidebar-link${isTasksView ? ' sidebar-link--active' : ''}`}
            aria-current={isTasksView ? 'page' : undefined}
            onClick={closeMenu}
          >
            <Icon name="tasks" />
            <span>My tasks</span>
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="sidebar-tip-icon">
              <Icon name="sparkles" size={19} />
            </span>
            <strong>Make every day count</strong>
            <p>Stay focused and take your work one step at a time.</p>
          </div>
          <div className="sidebar-user">
            <span className="sidebar-avatar">{initials}</span>
            <div className="sidebar-user-details">
              <strong>{user.name}</strong>
              <span>Signed in</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="dashboard-body">
        {/* Navbar: controls stay visible even when the page scrolls. */}
        <header className="dashboard-header">
          <div className="dashboard-header-start">
            <button
              type="button"
              className="mobile-menu-button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="taskflow-sidebar"
              onClick={() => setMenuOpen((previous) => !previous)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
            <div className="dashboard-breadcrumb">
              <span>Workspace</span>
              <Icon name="chevron" size={15} />
              <strong>{isTasksView ? 'My tasks' : isProfileView ? 'My profile' : 'Overview'}</strong>
            </div>
          </div>

          <div className="dashboard-header-end">
            <span className="dashboard-date">
              <Icon name="calendar" size={17} />
              {today}
            </span>

            {/* Theme toggle moved from sidebar to top navigation. */}
            <button
              type="button"
              className="dashboard-nav-action dashboard-nav-theme"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
              <span className="dashboard-nav-label">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
            </button>

            {/* Sign out is also in the top navigation. */}
            <button
              type="button"
              className="dashboard-nav-action dashboard-nav-logout"
              onClick={handleLogout}
            >
              <Icon name="logout" size={17} />
              <span>Sign out</span>
            </button>

            <span
              className="dashboard-header-avatar"
              title={user.name}
              aria-label={`Signed in as ${user.name}`}
            >
              {initials}
            </span>
          </div>
        </header>

        {isTasksView ? (
          <main id="tasks" className="dashboard-content">
            <TasksPage />
          </main>
        ) : isProfileView ? (
          <main id="profile" className="dashboard-content">
            <ProfilePage />
          </main>
        ) : (
          <main id="overview" className="dashboard-content">
          {/* Live welcome banner, task metrics, deadlines and account preview. */}
          <DashboardOverview
            user={user}
            greeting={greeting}
            firstName={firstName}
            initials={initials}
            memberSince={memberSince}
          />

          {/* Sign out was moved to the navbar. */}
          <footer className="dashboard-footer">
            <p>
              Your work is saved to your account. Remember to sign out when using a shared computer.
            </p>
          </footer>
          </main>
        )}
      </div>
    </div>
  )
}
