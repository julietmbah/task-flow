
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilters,
} from '../types/task'

/**
 * TaskFlow Tasks API Service
 *
 * Handles communication with the NestJS tasks endpoints.
 *
 * The Vite proxy forwards:
 * /api/tasks -> http://localhost:8080/tasks
 *
 * All task requests require a JWT access token.
 */

const TASKS_API_URL = '/api/tasks'

/**
 * Extract readable errors returned by NestJS.
 */
function getTaskErrorMessage(
  responseBody: unknown,
  status: number,
): string {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'message' in responseBody
  ) {
    const message = responseBody.message

    if (typeof message === 'string' && message.length > 0) {
      return message
    }

    if (Array.isArray(message)) {
      return message
        .filter((item): item is string => typeof item === 'string')
        .join('. ')
    }
  }

  if (status === 401) {
    return 'Your session has expired. Please sign in again.'
  }

  if (status === 404) {
    return 'The requested task was not found.'
  }

  if (status >= 500) {
    return 'A server error occurred. Please try again.'
  }

  return 'Unable to complete the task request.'
}

/**
 * Shared authenticated request helper.
 *
 * Avoids duplicating fetch, authorization,
 * error handling, and JSON parsing.
 */
async function taskRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  if (!accessToken.trim()) {
    throw new Error('Please sign in to manage your tasks.')
  }

  const headers = new Headers(options.headers)

  headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${accessToken}`)

  if (options.body !== undefined && options.body !== null) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(`${TASKS_API_URL}${endpoint}`, {
      ...options,
      headers,
      cache: 'no-store',
    })
  } catch {
    throw new Error(
      'Unable to connect to TaskFlow. Check your connection.',
    )
  }

  // DELETE returns 204 No Content.
  // Other successful endpoints return JSON.
  const responseBody: unknown =
    response.status === 204
      ? null
      : await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      getTaskErrorMessage(responseBody, response.status),
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  if (responseBody === null) {
    throw new Error('The server returned an unexpected response.')
  }

  return responseBody as T
}

/**
 * GET /tasks
 *
 * Retrieve authenticated user's tasks.
 *
 * Supports status, search, and sorting.
 * Pagination will be added after verifying
 * the backend's paginated response structure.
 */
export async function getTasks(
  accessToken: string,
  filters: TaskFilters = {},
): Promise<Task[]> {
  const params = new URLSearchParams()

  if (filters.status) {
    params.set('status', filters.status)
  }

  if (filters.search?.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters.sortBy) {
    params.set('sortBy', filters.sortBy)
  }

  if (filters.order) {
    params.set('order', filters.order)
  }

  const query = params.toString()
  const endpoint = query ? `?${query}` : ''

  const result = await taskRequest<unknown>(
    endpoint,
    accessToken,
  )

  if (!Array.isArray(result)) {
    throw new Error('Unexpected task list response.')
  }

  return result as Task[]
}

/**
 * GET /tasks/:id
 *
 * Retrieve one task.
 */
export async function getTaskById(
  accessToken: string,
  taskId: string,
): Promise<Task> {
  return taskRequest<Task>(
    `/${encodeURIComponent(taskId)}`,
    accessToken,
  )
}

/**
 * POST /tasks
 *
 * Create a new task.
 */
export async function createTask(
  accessToken: string,
  taskData: CreateTaskInput,
): Promise<Task> {
  return taskRequest<Task>('', accessToken, {
    method: 'POST',
    body: JSON.stringify(taskData),
  })
}

/**
 * PATCH /tasks/:id
 *
 * Update an existing task.
 */
export async function updateTask(
  accessToken: string,
  taskId: string,
  taskData: UpdateTaskInput,
): Promise<Task> {
  return taskRequest<Task>(
    `/${encodeURIComponent(taskId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(taskData),
    },
  )
}

/**
 * DELETE /tasks/:id
 *
 * Delete an existing task.
 * The backend returns HTTP 204.
 */
export async function deleteTask(
  accessToken: string,
  taskId: string,
): Promise<void> {
  return taskRequest<void>(
    `/${encodeURIComponent(taskId)}`,
    accessToken,
    {
      method: 'DELETE',
    },
  )
}
