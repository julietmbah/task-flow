
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';

import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

import {
  TasksService,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TaskStatusFilter,
  type TaskSortBy,
  type TaskSortOrder,
} from './tasks.service.js';

/**
 * TasksController
 *
 * Base route: /tasks
 *
 * All endpoints require JWT authentication.
 */
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * POST /tasks
   *
   * Create a task for the authenticated user.
   */
  @Post()
  async createTask(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateTaskDto,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    const input: CreateTaskInput = {
      title: dto.title,
    };

    // Include optional description.
    if (dto.description !== undefined) {
      input.description = dto.description;
    }

    // Convert an ISO date to a Date object.
    if (dto.dueDate !== undefined) {
      input.dueDate = new Date(dto.dueDate);
    }

    return this.tasksService.createTask(userId, input);
  }

  /**
   * GET /tasks
   *
   * Supports:
   * - Status filtering.
   * - Searching.
   * - Sorting.
   * - Pagination.
   *
   * Examples:
   *
   * GET /tasks
   * GET /tasks?status=TODO
   * GET /tasks?search=report
   * GET /tasks?sortBy=dueDate&order=asc
   * GET /tasks?page=1&limit=10
   * GET /tasks?status=TODO&page=2&limit=5
   */
  @Get()
  async findAll(
    @Req() request: AuthenticatedRequest,

    // Validate optional status.
    @Query(
      'status',
      new ParseEnumPipe(
        ['TODO', 'IN_PROGRESS', 'COMPLETED'],
        { optional: true },
      ),
    )
    status?: TaskStatusFilter,

    // Search is validated manually below.
    @Query('search')
    search?: unknown,

    // Validate optional sorting field.
    @Query(
      'sortBy',
      new ParseEnumPipe(
        ['createdAt', 'dueDate'],
        { optional: true },
      ),
    )
    sortBy?: TaskSortBy,

    // Validate optional sorting direction.
    @Query(
      'order',
      new ParseEnumPipe(
        ['asc', 'desc'],
        { optional: true },
      ),
    )
    order?: TaskSortOrder,

    // Parse the optional page number.
    @Query(
      'page',
      new ParseIntPipe({ optional: true }),
    )
    page?: number,

    // Parse the optional page size.
    @Query(
      'limit',
      new ParseIntPipe({ optional: true }),
    )
    limit?: number,
  ) {
    // Identify the authenticated user.
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    /**
     * SEARCH VALIDATION
     */
    let cleanedSearch: string | undefined;

    if (search !== undefined) {
      // Reject arrays and other non-string inputs.
      if (typeof search !== 'string') {
        throw new BadRequestException(
          'Search must be a string.',
        );
      }

      // Remove surrounding whitespace.
      cleanedSearch = search.trim();

      // Allow search terms containing 1-100 characters.
      if (
        cleanedSearch.length === 0 ||
        cleanedSearch.length > 100
      ) {
        throw new BadRequestException(
          'Search must contain 1 to 100 characters.',
        );
      }
    }

    /**
     * PAGINATION VALIDATION
     *
     * Page must be a positive integer.
     */
    if (
      page !== undefined &&
      (!Number.isSafeInteger(page) || page < 1)
    ) {
      throw new BadRequestException(
        'Page must be a positive integer.',
      );
    }

    /**
     * Limit must be between 1 and 100.
     */
    if (
      limit !== undefined &&
      (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
    ) {
      throw new BadRequestException(
        'Limit must be between 1 and 100.',
      );
    }

    /**
     * PAGINATED RESULTS
     *
     * Pagination is enabled when page or
     * limit is explicitly provided.
     */
    if (page !== undefined || limit !== undefined) {
      const currentPage = page ?? 1;
      const pageSize = limit ?? 10;

      // Prevent offsets exceeding Prisma's integer range.
      const skip = (currentPage - 1) * pageSize;

      if (
        !Number.isSafeInteger(skip) ||
        skip > 2147483647
      ) {
        throw new BadRequestException(
          'Requested page is too large.',
        );
      }

      return this.tasksService.findAll(
        userId,
        status,
        cleanedSearch,
        sortBy ?? 'createdAt',
        order ?? 'desc',
        currentPage,
        pageSize,
      );
    }

    /**
     * SORTED RESULTS
     *
     * Preserve existing sorting behavior when
     * pagination has not been requested.
     */
    if (
      sortBy !== undefined ||
      order !== undefined
    ) {
      return this.tasksService.findAll(
        userId,
        status,
        cleanedSearch,
        sortBy ?? 'createdAt',
        order ?? 'desc',
      );
    }

    /**
     * SEARCH RESULTS
     */
    if (cleanedSearch !== undefined) {
      return this.tasksService.findAll(
        userId,
        status,
        cleanedSearch,
      );
    }

    /**
     * STATUS-FILTERED RESULTS
     */
    if (status !== undefined) {
      return this.tasksService.findAll(
        userId,
        status,
      );
    }

    /**
     * ORIGINAL GET /tasks RESPONSE
     *
     * Without query parameters, return
     * an ordinary array of owned tasks.
     */
    return this.tasksService.findAll(userId);
  }

  /**
   * GET /tasks/:id
   */
  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    taskId: string,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    return this.tasksService.findOne(userId, taskId);
  }

  /**
   * PATCH /tasks/:id
   */
  @Patch(':id')
  async updateTask(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    // Include only fields actually provided.
    const input: UpdateTaskInput = {};

    if (dto.title !== undefined) {
      input.title = dto.title;
    }

    // Null clears an existing description.
    if (dto.description !== undefined) {
      input.description = dto.description;
    }

    if (dto.status !== undefined) {
      input.status = dto.status;
    }

    // Convert an ISO date or clear it with null.
    if (dto.dueDate !== undefined) {
      input.dueDate =
        dto.dueDate === null
          ? null
          : new Date(dto.dueDate);
    }

    // Reject empty updates.
    if (Object.keys(input).length === 0) {
      throw new BadRequestException(
        'Provide at least one task field to update.',
      );
    }

    return this.tasksService.updateTask(
      userId,
      taskId,
      input,
    );
  }

  /**
   * DELETE /tasks/:id
   *
   * Return HTTP 204 after successful deletion.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    taskId: string,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    await this.tasksService.deleteTask(userId, taskId);
  }
}
