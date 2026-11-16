
/**
 * TaskFlow Task Types
 *
 * Shared TypeScript definitions for task management.
 * These match the existing NestJS task API.
 */

// The three statuses supported by our backend.
export type TaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'COMPLETED'

// Task information returned by the backend.
export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

// Information required to create a task.
export interface CreateTaskInput {
  title: string
  description?: string
  dueDate?: string
}

// Information that can be changed on an existing task.
export interface UpdateTaskInput {
  title?: string
  description?: string | null
  status?: TaskStatus
  dueDate?: string | null
}

// Supported sorting fields.
export type TaskSortBy = 'createdAt' | 'dueDate'

// Optional filters for retrieving tasks.
export interface TaskFilters {
  status?: TaskStatus
  search?: string
  sortBy?: TaskSortBy
  order?: 'asc' | 'desc'
}
