import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useAuth } from '../hooks/useAuth'
import { getTasks } from '../services/tasksApi'
import type { AuthUser } from '../types/auth'
import type { Task, TaskStatus } from '../types/task'

/**
 * TaskFlow — professional, live dashboard overview.
 *
 * All statistics come from GET /tasks for the signed-in user.
 * We deliberately use the unpaginated endpoint so counts are not limited
 * to the current page of the My Tasks table.
 *
 * This component does not manage the navbar/sidebar or store the JWT.
 * All visual styles live in src/index.css.
 */
interface DashboardOverviewProps {
  user: AuthUser
  firstName: string
  greeting: string
  initials: string
  memberSince: string
}

type RequestState = 'loading' | 'ready' | 'error'
type DashboardIconName =
  | 'layers'
  | 'circle'
  | 'activity'
  | 'check'
  | 'arrow'
  | 'refresh'
  | 'calendar'
  | 'clock'
  | 'trending'
  | 'sparkles'
  | 'user'
  | 'alert'

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

/** Small, self-contained SVG icons: no new package is required. */
function DashboardIcon({
  name,
  size = 20,
}: {
  name: DashboardIconName
  size?: number
}) {
  const paths: Record<DashboardIconName, ReactNode> = {
    layers: (
      <>
        <rect x="3" y="4" width="8" height="8" rx="2" />
        <rect x="13" y="4" width="8" height="8" rx="2" />
        <rect x="3" y="14" width="8" height="7" rx="2" />
        <rect x="13" y="14" width="8" height="7" rx="2" />
      </>
    ),
    circle: <circle cx="12" cy="12" r="8" />,
    activity: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M7.5 12h3l2-4 2.5 8 1.7-4h.8" />
      </>
    ),
    check: <path d="M4.5 12.5 9.5 17.5 20 7" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.5 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.5-2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    trending: <path d="m3 17 6-6 4 4 8-8m-6 0h6v6" />,
    sparkles: (
      <>
        <path d="m12 2 2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3L12 2Z" />
        <path d="m19 18 .7 1.3L21 20l-1.3.7L19 22l-.7-1.3L17 20l1.3-.7L19 18Z" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 9 16H3L12 3Z" />
        <path d="M12 9v4M12 16h.01" />
      </>
    ),
  }

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
      {paths[name]}
    </svg>
  )
}

/** Format a backend date safely. */
function formatDate(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? DATE_FORMAT.format(new Date(timestamp))
    : 'Date unavailable'
}

/** Ignore invalid and missing deadlines. */
function getDueTimestamp(task: Task): number | null {
  if (!task.dueDate) return null
  const timestamp = Date.parse(task.dueDate)
  return Number.isFinite(timestamp) ? timestamp : null
}

/** A real task-based percentage, including when there are zero tasks. */
function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export default function DashboardOverview({
  user,
  firstName,
  greeting,
  initials,
  memberSince,
}: DashboardOverviewProps) {
  const { accessToken } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [requestState, setRequestState] = useState<RequestState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [lastCheckedAt, setLastCheckedAt] = useState(() => new Date())

  /**
   * Load real, authenticated task data at mount and after Refresh.
   * Ignore stale responses if the user navigates away or refreshes again.
   */
  useEffect(() => {
    let active = true

    if (!accessToken) {
      return () => {
        active = false
      }
    }

    getTasks(accessToken)
      .then((result) => {
        if (!active) return
        setTasks(result)
        setLastCheckedAt(new Date())
        setErrorMessage(null)
        setRequestState('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'We could not load your tasks. Please try again.',
        )
        setRequestState('error')
      })

    return () => {
      active = false
    }
  }, [accessToken, refreshVersion])

  function handleRefresh(): void {
    setRequestState('loading')
    setErrorMessage(null)
    setRefreshVersion((version) => version + 1)
  }

  const isReady = requestState === 'ready'
  const total = tasks.length
  const todo = tasks.filter((task) => task.status === 'TODO').length
  const inProgress = tasks.filter((task) => task.status === 'IN_PROGRESS').length
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length
  const completionRate = percentage(completed, total)
  const now = lastCheckedAt.getTime()

  const deadlines = tasks
    .filter((task) => task.status !== 'COMPLETED')
    .map((task) => ({ task, timestamp: getDueTimestamp(task) }))
    .filter((item): item is { task: Task; timestamp: number } => item.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp)

  const overdueCount = deadlines.filter(({ timestamp }) => timestamp < now).length
  const nearestDeadlines = deadlines.slice(0, 4)
  const recentTasks = [...tasks]
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    .slice(0, 4)

  const metrics = [
    {
      label: 'Total tasks',
      value: total,
      caption: 'Everything on your list',
      tone: 'total',
      icon: 'layers',
      portion: total > 0 ? 100 : 0,
    },
    {
      label: 'To do',
      value: todo,
      caption: 'Ready when you are',
      tone: 'todo',
      icon: 'circle',
      portion: percentage(todo, total),
    },
    {
      label: 'In progress',
      value: inProgress,
      caption: 'Currently underway',
      tone: 'progress',
      icon: 'activity',
      portion: percentage(inProgress, total),
    },
    {
      label: 'Completed',
      value: completed,
      caption: 'Finished successfully',
      tone: 'completed',
      icon: 'check',
      portion: completionRate,
    },
  ] as const

  return (
    <div className="insight-dashboard" aria-label="Your live TaskFlow dashboard">
      {/* Distinct welcome banner with an SVG progress ring (all values live). */}
      <section className="insight-hero" aria-labelledby="insight-welcome-heading">
        <div className="insight-hero-orb insight-hero-orb--one" aria-hidden="true" />
        <div className="insight-hero-orb insight-hero-orb--two" aria-hidden="true" />
        <div className="insight-hero-copy">
          <span className="insight-hero-badge">
            <DashboardIcon name="sparkles" size={15} /> YOUR WORKSPACE
          </span>
          <h1 id="insight-welcome-heading">
            {greeting}, <span>{firstName}</span>
          </h1>
          <p>
            Your day, in focus. Stay on top of your tasks, see what is moving,
            and make progress one step at a time.
          </p>
          <div className="insight-hero-actions">
            <Link to="/tasks" className="insight-hero-action-primary">
              Manage my tasks <DashboardIcon name="arrow" size={17} />
            </Link>
            <button
              type="button"
              className="insight-hero-action-secondary"
              disabled={requestState === 'loading'}
              onClick={handleRefresh}
            >
              <DashboardIcon name="refresh" size={16} />
              {requestState === 'loading' ? 'Refreshing…' : 'Refresh overview'}
            </button>
          </div>
        </div>

        <div className="insight-hero-visual" aria-label="Completion snapshot">
          <div className="insight-hero-visual-label">YOUR MOMENTUM</div>
          <div className="insight-hero-ring-wrap">
            <svg className="insight-hero-ring" viewBox="0 0 116 116" aria-hidden="true">
              <circle className="insight-hero-ring-track" cx="58" cy="58" r="46" />
              <circle
                className="insight-hero-ring-value"
                cx="58"
                cy="58"
                r="46"
                transform="rotate(-90 58 58)"
                strokeDasharray={`${isReady ? (completionRate / 100) * 289.03 : 0} 289.03`}
              />
            </svg>
            <div className="insight-hero-ring-text">
              <strong>{isReady ? `${completionRate}%` : '—'}</strong>
              <span>complete</span>
            </div>
          </div>
          <p>
            {isReady
              ? `${completed} of ${total} ${total === 1 ? 'task' : 'tasks'} completed`
              : requestState === 'loading'
                ? 'Checking your progress…'
                : 'Progress unavailable'}
          </p>
        </div>
      </section>

      {requestState === 'error' && (
        <div className="insight-error" role="alert">
          <DashboardIcon name="alert" />
          <div>
            <strong>We couldn't load the latest task data.</strong>
            <p>{errorMessage}</p>
          </div>
          <button type="button" onClick={handleRefresh}>Try again</button>
        </div>
      )}

      {/* KPI cards: icons, numbers and shares are all sourced from real tasks. */}
      <header className="insight-section-heading">
        <div>
          <p className="insight-kicker">PERFORMANCE OVERVIEW</p>
          <h2>Everything at a glance</h2>
          <p>A clear snapshot of your current workload.</p>
        </div>
        <span className="insight-last-updated">
          <span className="insight-live-dot" />
          {isReady
            ? `Updated ${TIME_FORMAT.format(lastCheckedAt)}`
            : requestState === 'loading'
              ? 'Loading live data…'
              : 'Update unavailable'}
        </span>
      </header>

      <div className="insight-metrics" aria-live="polite" aria-busy={requestState === 'loading'}>
        {metrics.map((metric) => (
          <section
            className={`insight-metric insight-metric--${metric.tone}`}
            key={metric.tone}
            aria-label={metric.label}
          >
            <div className="insight-metric-top">
              <span className={`insight-metric-icon insight-metric-icon--${metric.tone}`}>
                <DashboardIcon name={metric.icon} size={21} />
              </span>
              <span className="insight-metric-share">
                {isReady ? `${metric.portion}%` : '—'}
              </span>
            </div>
            <p className="insight-metric-label">{metric.label}</p>
            <strong className="insight-metric-value">
              {isReady ? metric.value.toLocaleString() : '—'}
            </strong>
            <p className="insight-metric-caption">{metric.caption}</p>
            <div className="insight-metric-track" aria-hidden="true">
              <span style={{ width: `${isReady ? metric.portion : 0}%` }} />
            </div>
          </section>
        ))}
      </div>

      <div className="insight-main-grid">
        {/* Progress distribution: no invented trend or previous-period values. */}
        <section className="insight-panel insight-workload" aria-labelledby="insight-workload-title">
          <div className="insight-panel-heading">
            <div>
              <p className="insight-kicker">WORKLOAD</p>
              <h2 id="insight-workload-title">Task breakdown</h2>
              <p>See how your work is distributed.</p>
            </div>
            <span className="insight-panel-symbol insight-panel-symbol--purple">
              <DashboardIcon name="trending" size={20} />
            </span>
          </div>
          {isReady ? (
            <>
              <div className="insight-workload-summary">
                <strong>{total.toLocaleString()}</strong>
                <span>{total === 1 ? 'task in your workspace' : 'tasks in your workspace'}</span>
              </div>
              <div
                className="insight-stack-bar"
                role="img"
                aria-label={`${todo} to do, ${inProgress} in progress, ${completed} completed`}
              >
                <span className="insight-stack-bar--todo" style={{ width: `${percentage(todo, total)}%` }} />
                <span className="insight-stack-bar--progress" style={{ width: `${percentage(inProgress, total)}%` }} />
                <span className="insight-stack-bar--done" style={{ width: `${percentage(completed, total)}%` }} />
              </div>
              <div className="insight-breakdown-list">
                <div><span><i className="insight-status-dot insight-status-dot--todo" />To do</span><strong>{todo}</strong><em>{percentage(todo, total)}%</em></div>
                <div><span><i className="insight-status-dot insight-status-dot--progress" />In progress</span><strong>{inProgress}</strong><em>{percentage(inProgress, total)}%</em></div>
                <div><span><i className="insight-status-dot insight-status-dot--done" />Completed</span><strong>{completed}</strong><em>{completionRate}%</em></div>
              </div>
              <div className={`insight-workload-note${overdueCount ? ' insight-workload-note--alert' : ''}`}>
                <DashboardIcon name={overdueCount ? 'alert' : 'check'} size={17} />
                <span>
                  {overdueCount > 0
                    ? `${overdueCount} unfinished ${overdueCount === 1 ? 'task needs' : 'tasks need'} attention past the deadline.`
                    : total === 0
                      ? 'Create your first task to start tracking your progress.'
                      : 'No overdue tasks — keep your momentum going.'}
                </span>
              </div>
            </>
          ) : (
            <p className="insight-panel-placeholder">
              {requestState === 'loading' ? 'Loading your task distribution…' : 'Task distribution is unavailable.'}
            </p>
          )}
        </section>

        {/* A short, actionable list of genuine incomplete tasks with due dates. */}
        <section className="insight-panel insight-deadlines" aria-labelledby="insight-deadlines-title">
          <div className="insight-panel-heading">
            <div>
              <p className="insight-kicker">SCHEDULE</p>
              <h2 id="insight-deadlines-title">Upcoming deadlines</h2>
              <p>Your next tasks that have due dates.</p>
            </div>
            <span className="insight-panel-symbol insight-panel-symbol--blue">
              <DashboardIcon name="calendar" size={20} />
            </span>
          </div>
          {isReady && overdueCount > 0 && (
            <span className="insight-overdue-pill">
              <DashboardIcon name="alert" size={13} /> {overdueCount} overdue
            </span>
          )}
          {!isReady ? (
            <p className="insight-panel-placeholder">
              {requestState === 'loading' ? 'Loading your deadlines…' : 'Deadlines are unavailable.'}
            </p>
          ) : nearestDeadlines.length === 0 ? (
            <div className="insight-empty">
              <span className="insight-empty-icon"><DashboardIcon name="calendar" size={24} /></span>
              <strong>You're all caught up on deadlines</strong>
              <p>Unfinished tasks with due dates will appear here.</p>
            </div>
          ) : (
            <ul className="insight-deadline-list">
              {nearestDeadlines.map(({ task, timestamp }) => (
                <li key={task.id}>
                  <div className="insight-deadline-date">
                    <strong>{new Date(timestamp).toLocaleDateString(undefined, { day: '2-digit' })}</strong>
                    <span>{new Date(timestamp).toLocaleDateString(undefined, { month: 'short' })}</span>
                  </div>
                  <div className="insight-deadline-info">
                    <strong title={task.title}>{task.title}</strong>
                    <span>{STATUS_LABEL[task.status]}</span>
                  </div>
                  <div className="insight-deadline-right">
                    {timestamp < now ? (
                      <span className="insight-mini-status insight-mini-status--overdue">Overdue</span>
                    ) : (
                      <span className="insight-mini-status">Upcoming</span>
                    )}
                    <span className="insight-deadline-year">{new Date(timestamp).getFullYear()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/tasks" className="insight-inline-link">
            View all tasks <DashboardIcon name="arrow" size={16} />
          </Link>
        </section>
      </div>

      <div className="insight-bottom-grid">
        <section className="insight-panel insight-recent" aria-labelledby="insight-recent-title">
          <div className="insight-panel-heading">
            <div>
              <p className="insight-kicker">YOUR ACTIVITY</p>
              <h2 id="insight-recent-title">Recently created tasks</h2>
              <p>Your latest additions to the workspace.</p>
            </div>
            <span className="insight-panel-symbol insight-panel-symbol--mint">
              <DashboardIcon name="clock" size={20} />
            </span>
          </div>
          {!isReady ? (
            <p className="insight-panel-placeholder">
              {requestState === 'loading' ? 'Loading recent tasks…' : 'Recent tasks are unavailable.'}
            </p>
          ) : recentTasks.length === 0 ? (
            <div className="insight-empty insight-empty--compact">
              <strong>No tasks created yet</strong>
              <p>Your latest tasks will show up here once you add them.</p>
            </div>
          ) : (
            <ul className="insight-recent-list">
              {recentTasks.map((task) => (
                <li key={task.id}>
                  <span className={`insight-recent-indicator insight-recent-indicator--${task.status.toLowerCase().replace('_', '-')}`} />
                  <div className="insight-recent-name">
                    <strong title={task.title}>{task.title}</strong>
                    <span>Created {formatDate(task.createdAt)}</span>
                  </div>
                  <span className={`insight-status-tag insight-status-tag--${task.status.toLowerCase().replace('_', '-')}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/tasks" className="insight-inline-link">
            Open task manager <DashboardIcon name="arrow" size={16} />
          </Link>
        </section>

        {/* The existing profile anchor must remain for My profile navigation. */}
        <section id="profile" className="insight-panel insight-account" aria-labelledby="insight-account-title">
          <div className="insight-panel-heading">
            <div>
              <p className="insight-kicker">ACCOUNT</p>
              <h2 id="insight-account-title">Your profile</h2>
              <p>The workspace belongs to you.</p>
            </div>
            <span className="insight-panel-symbol insight-panel-symbol--purple">
              <DashboardIcon name="user" size={20} />
            </span>
          </div>
          <div className="insight-account-person">
            <span className="insight-account-avatar">{initials}</span>
            <div>
              <strong>{user.name}</strong>
              <span>TaskFlow member</span>
            </div>
          </div>
          <dl className="insight-account-details">
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Member since</dt><dd>{memberSince}</dd></div>
          </dl>
          <Link to="/tasks" className="insight-account-shortcut">
            <span><DashboardIcon name="layers" size={18} /> Go to my tasks</span>
            <DashboardIcon name="arrow" size={16} />
          </Link>
        </section>
      </div>
    </div>
  )
}
