import { useEffect, useRef, useState, type FormEvent } from 'react'

import { useAuth } from '../hooks/useAuth'
import { createTask, deleteTask, updateTask } from '../services/tasksApi'
import type { Task, TaskSortBy, TaskStatus, UpdateTaskInput } from '../types/task'

/**
 * Day 9 — My Tasks
 *
 * Displays task data from the authenticated NestJS API (never mock data).
 * Search, status filtering, sorting and pagination are performed by NestJS.
 *
 * Create, edit, complete/reopen and delete use the existing authenticated API.
 * Desktop: semantic table rows. Mobile/tablet: the same rows become cards.
 */

type SortOption = 'newest' | 'oldest' | 'dueSoon' | 'dueLatest'

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
}

const SORT_OPTIONS: Record<SortOption, { sortBy: TaskSortBy; order: 'asc' | 'desc' }> = {
  newest: { sortBy: 'createdAt', order: 'desc' },
  oldest: { sortBy: 'createdAt', order: 'asc' },
  dueSoon: { sortBy: 'dueDate', order: 'asc' },
  dueLatest: { sortBy: 'dueDate', order: 'desc' },
}

/**
 * NestJS GET /tasks?page=...&limit=... returns data plus pagination meta.
 * The existing getTasks() service deliberately expects an unpaginated array,
 * so this page uses a separate paginated reader without changing that service.
 */
interface TaskPageResponse {
  data: Task[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

const DEFAULT_PAGE_SIZE = 10

async function fetchTaskPage(
  token: string,
  options: {
    page: number
    limit: number
    search: string
    status: TaskStatus | ''
    sort: SortOption
  },
  signal: AbortSignal,
): Promise<TaskPageResponse> {
  const params = new URLSearchParams({
    page: String(options.page),
    limit: String(options.limit),
    sortBy: SORT_OPTIONS[options.sort].sortBy,
    order: SORT_OPTIONS[options.sort].order,
  })
  if (options.status) params.set('status', options.status)
  if (options.search) params.set('search', options.search)

  // /api is forwarded to NestJS by the existing Vite development proxy.
  let response: Response
  try {
    response = await fetch(`/api/tasks?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      signal,
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new Error('Unable to connect to TaskFlow. Please check your connection.', { cause })
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    let message = response.status === 401
      ? 'Your session has expired. Please sign in again.'
      : 'Unable to load your tasks.'
    if (body && typeof body === 'object' && 'message' in body) {
      const raw = body.message
      if (typeof raw === 'string' && raw.trim()) message = raw
      else if (Array.isArray(raw)) {
        const messages = raw.filter((item): item is string => typeof item === 'string')
        if (messages.length) message = messages.join('. ')
      }
    }
    throw new Error(message)
  }

  // Ensure the backend returned the paginated contract, not the old array.
  if (
    !body || typeof body !== 'object' ||
    !('data' in body) || !Array.isArray(body.data) ||
    !('meta' in body) || !body.meta || typeof body.meta !== 'object' ||
    !('total' in body.meta) || typeof body.meta.total !== 'number' ||
    !('totalPages' in body.meta) || typeof body.meta.totalPages !== 'number'
  ) {
    throw new Error('The server returned an unexpected paginated task response.')
  }
  return body as TaskPageResponse
}

/** Format dates safely without assuming the server always supplies a value. */
function formatDate(value: string | null): string {
  if (!value) return 'No due date'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Convert an ISO timestamp to the user's local datetime input value.
 * Do not use toISOString().slice(...) here: that would shift local time.
 */
function toLocalDateTimeInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const two = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`
}

/** Prevent invalid dates and completed tasks from showing as overdue. */
function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'COMPLETED') return false
  const due = new Date(task.dueDate)
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now()
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M5.8 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.2-3" />
    </svg>
  )
}

/** Lightweight SVG icons; no extra icon library or stylesheet required. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18" />
    </svg>
  )
}

function EmptyTasksIcon() {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="13" y="9" width="38" height="46" rx="7" />
      <path d="m22 24 3 3 5-6M35 24h9M22 39l3 3 5-6M35 39h9" />
    </svg>
  )
}

export default function TasksPage() {
  const { accessToken } = useAuth()

  // Keep the typed text separate from the API search to avoid a request on
  // every keystroke. The API validates search strings up to 100 characters.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [sort, setSort] = useState<SortOption>('newest')
  const [refreshCount, setRefreshCount] = useState(0)
  // Paginate on the server: only the current page is requested from PostgreSQL.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [pagination, setPagination] = useState<TaskPageResponse['meta']>({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // One reusable dialog handles creation, editing and delete confirmation.
  // Keep the current list/search state intact when switching between actions.
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('TODO')
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  // Refs guard double submissions even before React's next render.
  const modalBusyRef = useRef(false)
  const rowBusyRef = useRef<string | null>(null)
  const newTaskButtonRef = useRef<HTMLButtonElement>(null)
  const taskTitleRef = useRef<HTMLInputElement>(null)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // Trap Tab inside the dialog, close on Escape and restore focus afterward.
  // Body scroll is temporarily locked, but dialog content remains scrollable.
  useEffect(() => {
    if (!modalMode) return

    const previousOverflow = document.body.style.overflow
    const returnFocusTarget = restoreFocusRef.current
    // Capture the button once so the cleanup uses the same DOM node.
    const fallbackFocusTarget = newTaskButtonRef.current
    document.body.style.overflow = 'hidden'
    if (modalMode === 'delete') deleteCancelRef.current?.focus()
    else taskTitleRef.current?.focus()

    const handleDialogKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !modalBusyRef.current) {
        event.preventDefault()
        setModalMode(null)
        return
      }
      if (event.key !== 'Tab') return

      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDialogKeydown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleDialogKeydown)
      // The row may disappear after filtering/deletion; use New task as fallback.
      if (returnFocusTarget && document.contains(returnFocusTarget)) returnFocusTarget.focus()
      else fallbackFocusTarget?.focus()
    }
  }, [modalMode])

  const resetForm = () => {
    setTaskTitle('')
    setTaskDescription('')
    setTaskDueDate('')
    setTaskStatus('TODO')
    setModalError(null)
  }

  const openCreateDialog = (trigger?: HTMLElement) => {
    restoreFocusRef.current = trigger ?? newTaskButtonRef.current
    resetForm()
    setSelectedTask(null)
    setNotice(null)
    setRowError(null)
    setModalMode('create')
  }

  const openEditDialog = (task: Task, trigger: HTMLElement) => {
    restoreFocusRef.current = trigger
    setSelectedTask(task)
    setTaskTitle(task.title)
    setTaskDescription(task.description ?? '')
    setTaskDueDate(toLocalDateTimeInput(task.dueDate))
    setTaskStatus(task.status)
    setModalError(null)
    setRowError(null)
    setModalMode('edit')
  }

  const openDeleteDialog = (task: Task, trigger: HTMLElement) => {
    restoreFocusRef.current = trigger
    setSelectedTask(task)
    setModalError(null)
    setRowError(null)
    setModalMode('delete')
  }

  const closeDialog = () => {
    if (modalBusyRef.current) return
    setModalMode(null)
  }

  /** POST /tasks or PATCH /tasks/:id using the same validated form. */
  const handleSaveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (modalBusyRef.current) return

    const title = taskTitle.trim()
    if (!title || title.length > 200) {
      setModalError('Enter a task title between 1 and 200 characters.')
      taskTitleRef.current?.focus()
      return
    }
    if (!accessToken) {
      setModalError('Your session has ended. Please sign in again.')
      return
    }

    // datetime-local is in the visitor's timezone, while the API needs ISO.
    let dueDate: string | undefined
    if (taskDueDate) {
      const parsed = new Date(taskDueDate)
      if (Number.isNaN(parsed.getTime())) {
        setModalError('Please choose a valid date and time.')
        return
      }
      dueDate = parsed.toISOString()
    }

    modalBusyRef.current = true
    setModalBusy(true)
    setModalError(null)
    try {
      if (modalMode === 'edit' && selectedTask) {
        const changes: UpdateTaskInput = {
          title,
          description: taskDescription.trim() || null,
          dueDate: dueDate ?? null, // Clearing the field removes the deadline.
          status: taskStatus,
        }
        await updateTask(accessToken, selectedTask.id, changes)
        setNotice('Task updated successfully. It may move or disappear if a filter is active.')
      } else if (modalMode === 'create') {
        await createTask(accessToken, {
          title,
          ...(taskDescription.trim() ? { description: taskDescription.trim() } : {}),
          ...(dueDate ? { dueDate } : {}),
        })
        setNotice('Task created successfully. It may be hidden by your current filters.')
        setPage(1)
      } else {
        return
      }

      setModalMode(null)
      setSelectedTask(null)
      setRefreshCount((count) => count + 1)
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Unable to save the task. Try again.')
    } finally {
      modalBusyRef.current = false
      setModalBusy(false)
    }
  }

  /** Fast one-click completion/reopening, saved immediately to PostgreSQL. */
  const toggleCompleted = async (task: Task) => {
    if (rowBusyRef.current) return
    if (!accessToken) {
      setRowError('Your session has ended. Please sign in again.')
      return
    }

    const nextStatus: TaskStatus = task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED'
    rowBusyRef.current = task.id
    setRowBusyId(task.id)
    setRowError(null)
    setNotice(null)
    try {
      await updateTask(accessToken, task.id, { status: nextStatus })
      setNotice(nextStatus === 'COMPLETED' ? 'Task marked as completed.' : 'Task moved back to To do.')
      setRefreshCount((count) => count + 1)
    } catch (cause) {
      setRowError(cause instanceof Error ? cause.message : 'Unable to change task status.')
    } finally {
      rowBusyRef.current = null
      setRowBusyId(null)
    }
  }

  /** DELETE /tasks/:id: only after explicit confirmation. */
  const handleDeleteTask = async () => {
    if (!selectedTask || modalBusyRef.current) return
    if (!accessToken) {
      setModalError('Your session has ended. Please sign in again.')
      return
    }

    modalBusyRef.current = true
    setModalBusy(true)
    setModalError(null)
    try {
      await deleteTask(accessToken, selectedTask.id)
      setNotice('Task deleted successfully.')
      setSelectedTask(null)
      setModalMode(null)
      setRefreshCount((count) => count + 1)
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Unable to delete the task.')
    } finally {
      modalBusyRef.current = false
      setModalBusy(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    // Abort the old request when the page, search, or filters change.
    // This prevents a slow previous page from replacing newer results.
    const controller = new AbortController()

    async function loadTasks() {
      setLoading(true)
      setError(null)
      if (!accessToken) {
        setTasks([])
        setError('Your session is no longer available. Please sign in again.')
        setLoading(false)
        return
      }

      try {
        const result = await fetchTaskPage(
          accessToken,
          { page, limit: pageSize, search, status, sort },
          controller.signal,
        )
        if (controller.signal.aborted) return

        // Deleting the last item on the last page can make that page invalid.
        // Move to the new last page instead of leaving an empty table.
        if (result.meta.totalPages > 0 && page > result.meta.totalPages) {
          setPage(result.meta.totalPages)
          return
        }
        setTasks(result.data)
        setPagination(result.meta)
      } catch (cause) {
        if (controller.signal.aborted) return
        setTasks([])
        setError(cause instanceof Error ? cause.message : 'Unable to load your tasks.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadTasks()
    return () => controller.abort()
  }, [accessToken, search, status, sort, page, pageSize, refreshCount])

  const hasActiveFilters = search !== '' || status !== ''
  const isFiltered = hasActiveFilters || sort !== 'newest'
  const resetFilters = () => {
    setSearchInput('')
    setSearch('')
    setStatus('')
    setSort('newest')
    setPage(1)
  }
  const refreshTasks = () => setRefreshCount((count) => count + 1)

  const rangeStart = pagination.total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, pagination.total)
  const totalPages = Math.max(1, pagination.totalPages)
  const firstPageButton = Math.max(1, Math.min(page - 2, totalPages - 4))
  const numberedPages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => firstPageButton + index,
  )

  return (
    <div className="tasks-page">
      <div className="tasks-page-heading">
        <div>
          <p className="dashboard-eyebrow">YOUR WORKSPACE</p>
          <h1>My tasks</h1>
          <p>Keep track of everything you need to get done.</p>
        </div>
        <div className="tasks-heading-actions">
          <button type="button" className="tasks-refresh-button" onClick={refreshTasks} disabled={loading}>
            <RefreshIcon />
            <span>Refresh</span>
          </button>
          <button type="button" ref={newTaskButtonRef} className="tasks-create-button" onClick={(event) => openCreateDialog(event.currentTarget)}>
            <PlusIcon />
            <span>New task</span>
          </button>
        </div>
      </div>

      {notice && (
        <p className="tasks-creation-notice" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> {notice}
        </p>
      )}

      {rowError && (
        <p className="tasks-action-error" role="alert">{rowError}</p>
      )}

      {/* A responsive toolbar with explicitly labeled form controls. */}
      <section className="tasks-panel" aria-label="Task management">
        <div className="tasks-toolbar">
          <div className="tasks-search-field">
            <label htmlFor="tasks-search">Search tasks</label>
            <div className="tasks-search-input-wrap">
              <SearchIcon />
              <input
                id="tasks-search"
                type="search"
                autoComplete="off"
                placeholder="Search by title or description"
                maxLength={100}
                value={searchInput}
                onChange={(event) => { setSearchInput(event.target.value); setPage(1) }}
              />
            </div>
          </div>

          <div className="tasks-select-field">
            <label htmlFor="tasks-status">Status</label>
            <select
              id="tasks-status"
              value={status}
              onChange={(event) => { setStatus(event.target.value as TaskStatus | ''); setPage(1) }}
            >
              <option value="">All statuses</option>
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div className="tasks-select-field">
            <label htmlFor="tasks-sort">Sort by</label>
            <select
              id="tasks-sort"
              value={sort}
              onChange={(event) => { setSort(event.target.value as SortOption); setPage(1) }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="dueSoon">Due date: earliest</option>
              <option value="dueLatest">Due date: latest</option>
            </select>
          </div>
        </div>

        {/* The total is returned by NestJS, not just the current page length. */}
        <div className="tasks-result-bar">
          <p role="status" aria-live="polite">
            {loading ? 'Loading your tasks…' : error ? 'Could not load tasks' : `${pagination.total} ${pagination.total === 1 ? 'task' : 'tasks'} found`}
          </p>
          {isFiltered && (
            <button type="button" className="tasks-clear-button" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>

        <div className="tasks-results" aria-busy={loading}>
          {loading ? (
            <div className="tasks-loading" role="status" aria-label="Loading task list">
              <div className="tasks-skeleton" />
              <div className="tasks-skeleton" />
              <div className="tasks-skeleton" />
            </div>
          ) : error ? (
            <div className="tasks-empty-state" role="alert">
              <span className="tasks-empty-illustration"><EmptyTasksIcon /></span>
              <h2>We couldn't load your tasks</h2>
              <p>{error}</p>
              <button type="button" className="tasks-retry-button" onClick={refreshTasks}>Try again</button>
            </div>
          ) : tasks.length === 0 ? (
            <div className="tasks-empty-state">
              <span className="tasks-empty-illustration"><EmptyTasksIcon /></span>
              <h2>{hasActiveFilters ? 'No matching tasks' : 'Your task list is empty'}</h2>
              <p>
                {hasActiveFilters
                  ? 'Try another search or clear your filters to see more tasks.'
                  : 'When you add your first task, it will appear here.'}
              </p>
              {hasActiveFilters ? (
                <button type="button" className="tasks-retry-button" onClick={resetFilters}>Clear filters</button>
              ) : (
                <button type="button" className="tasks-create-button" onClick={(event) => openCreateDialog(event.currentTarget)}>
                  <PlusIcon /> Create your first task
                </button>
              )}
            </div>
          ) : (
            <table className="tasks-table" aria-label="Your tasks">
              <colgroup>
                <col className="tasks-col-title" />
                <col className="tasks-col-status" />
                <col className="tasks-col-due" />
                <col className="tasks-col-created" />
                <col className="tasks-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Status</th>
                  <th scope="col">Due date</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="tasks-cell-title" data-label="Task">
                      <div className="tasks-table-title-row">
                        <span className={`tasks-status-marker tasks-status-marker--${task.status.toLowerCase()}`} aria-hidden="true" />
                        <div>
                          <strong>{task.title}</strong>
                          {task.description && <p>{task.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`tasks-status-badge tasks-status-badge--${task.status.toLowerCase()}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </td>
                    <td data-label="Due date">
                      <span className={`tasks-table-date${isOverdue(task) ? ' tasks-due--overdue' : ''}`}>
                        <CalendarIcon />
                        <span>{isOverdue(task) ? 'Overdue: ' : ''}{formatDate(task.dueDate)}</span>
                      </span>
                    </td>
                    <td data-label="Created">{formatDate(task.createdAt)}</td>
                    <td className="tasks-table-actions" data-label="Actions">
                      <div className="tasks-item-actions" aria-label={`Actions for ${task.title}`}>
                        <button
                          type="button"
                          className="tasks-item-action tasks-item-action--complete"
                          disabled={rowBusyId !== null || loading}
                          onClick={() => void toggleCompleted(task)}
                          aria-label={`${task.status === 'COMPLETED' ? 'Reopen' : 'Complete'} ${task.title}`}
                        >
                          {rowBusyId === task.id ? 'Saving…' : task.status === 'COMPLETED' ? 'Reopen' : 'Complete'}
                        </button>
                        <button
                          type="button"
                          className="tasks-item-action"
                          disabled={rowBusyId !== null || loading}
                          onClick={(event) => openEditDialog(task, event.currentTarget)}
                          aria-label={`Edit ${task.title}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="tasks-item-action tasks-item-action--danger"
                          disabled={rowBusyId !== null || loading}
                          onClick={(event) => openDeleteDialog(task, event.currentTarget)}
                          aria-label={`Delete ${task.title}`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Keep navigation visible even with one page; Next/Previous disable safely. */}
        {!loading && !error && (
          <nav className="tasks-pagination" aria-label="Task pages">
            <p className="tasks-pagination-summary">
              {pagination.total === 0
                ? 'Showing 0 tasks'
                : `Showing ${rangeStart}–${rangeEnd} of ${pagination.total} tasks`}
            </p>
            <div className="tasks-pagination-controls">
              <label className="tasks-page-size" htmlFor="tasks-page-size">
                Rows per page
                <select
                  id="tasks-page-size"
                  value={pageSize}
                  onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </label>
              <div className="tasks-page-buttons">
                <button
                  type="button"
                  className="tasks-page-button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                {numberedPages.map((number) => (
                  <button
                    key={number}
                    type="button"
                    className={`tasks-page-button${page === number ? ' tasks-page-button--current' : ''}`}
                    onClick={() => setPage(number)}
                    aria-label={`Page ${number}`}
                    aria-current={page === number ? 'page' : undefined}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  className="tasks-page-button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          </nav>
        )}
      </section>

      {/* Reusable dialog. It never changes the navbar or shared dashboard. */}
      {modalMode && (
        <div
          className="task-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog()
          }}
        >
          <div
            ref={dialogRef}
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-dialog-heading"
            aria-describedby="task-dialog-description"
          >
            <div className="task-modal-header">
              <div>
                <p className="dashboard-eyebrow">TASK MANAGEMENT</p>
                <h2 id="task-dialog-heading">
                  {modalMode === 'create' ? 'Create a new task' : modalMode === 'edit' ? 'Edit task' : 'Delete task?'}
                </h2>
                <p id="task-dialog-description">
                  {modalMode === 'create'
                    ? 'Plan what you need to get done.'
                    : modalMode === 'edit'
                      ? 'Update the details and status of your task.'
                      : 'Please confirm before permanently removing this task.'}
                </p>
              </div>
              <button
                type="button"
                className="task-modal-close"
                onClick={closeDialog}
                aria-label="Close dialog"
                disabled={modalBusy}
              >
                <CloseIcon />
              </button>
            </div>

            {modalMode === 'delete' ? (
              <div className="task-delete-body">
                <p className="task-delete-warning">
                  Are you sure you want to delete <strong>{selectedTask?.title}</strong>?
                </p>
                <p className="task-delete-explanation">
                  This action cannot be undone. The task will be removed from your account.
                </p>
                {modalError && <p className="task-create-error" role="alert">{modalError}</p>}
                <div className="task-modal-actions">
                  <button
                    ref={deleteCancelRef}
                    type="button"
                    className="task-create-cancel"
                    onClick={closeDialog}
                    disabled={modalBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="task-delete-confirm"
                    onClick={() => void handleDeleteTask()}
                    disabled={modalBusy}
                  >
                    {modalBusy ? 'Deleting…' : 'Yes, delete task'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => void handleSaveTask(event)} className="task-create-form">
                <div className="task-create-field">
                  <label htmlFor="task-form-title">Task title <span aria-hidden="true">*</span></label>
                  <input
                    ref={taskTitleRef}
                    id="task-form-title"
                    name="title"
                    type="text"
                    placeholder="e.g. Review project requirements"
                    value={taskTitle}
                    maxLength={200}
                    required
                    disabled={modalBusy}
                    onChange={(event) => setTaskTitle(event.target.value)}
                  />
                  <span className="task-create-hint">{taskTitle.length}/200 characters</span>
                </div>

                <div className="task-create-field">
                  <label htmlFor="task-form-description">Description <span className="task-optional">(optional)</span></label>
                  <textarea
                    id="task-form-description"
                    name="description"
                    rows={4}
                    placeholder="Add helpful details about this task..."
                    value={taskDescription}
                    maxLength={5000}
                    disabled={modalBusy}
                    onChange={(event) => setTaskDescription(event.target.value)}
                  />
                  <span className="task-create-hint">{taskDescription.length}/5000 characters</span>
                </div>

                <div className="task-create-field">
                  <label htmlFor="task-form-due-date">Due date and time <span className="task-optional">(optional)</span></label>
                  <input
                    id="task-form-due-date"
                    name="dueDate"
                    type="datetime-local"
                    value={taskDueDate}
                    disabled={modalBusy}
                    onChange={(event) => setTaskDueDate(event.target.value)}
                  />
                  <span className="task-create-hint">Uses your device's local time. Clear it to remove the due date.</span>
                </div>

                {modalMode === 'edit' ? (
                  <div className="task-create-field">
                    <label htmlFor="task-form-status">Task status</label>
                    <select
                      id="task-form-status"
                      name="status"
                      value={taskStatus}
                      disabled={modalBusy}
                      onChange={(event) => setTaskStatus(event.target.value as TaskStatus)}
                    >
                      <option value="TODO">To do</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                ) : (
                  <p className="task-create-status-note">New tasks start with <strong>To do</strong> status.</p>
                )}

                {modalError && <p className="task-create-error" role="alert">{modalError}</p>}

                <div className="task-modal-actions">
                  <button type="button" className="task-create-cancel" onClick={closeDialog} disabled={modalBusy}>
                    Cancel
                  </button>
                  <button type="submit" className="tasks-create-button" disabled={modalBusy}>
                    {modalMode === 'create' && <PlusIcon />}
                    {modalBusy ? 'Saving…' : modalMode === 'create' ? 'Create task' : 'Save changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
