
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
} from './tasks.service.js';

/**
 * TasksController
 *
 * Base route: /tasks
 *
 * All task operations require a valid JWT.
 */
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * POST /tasks
   *
   * Create a new task for the authenticated user.
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

    // Add optional description.
    if (dto.description !== undefined) {
      input.description = dto.description;
    }

    // Convert ISO date text to a JavaScript Date.
    if (dto.dueDate !== undefined) {
      input.dueDate = new Date(dto.dueDate);
    }

    return this.tasksService.createTask(userId, input);
  }

  /**
   * GET /tasks
   *
   * Retrieve all tasks belonging to the current user.
   */
  @Get()
  async findAll(
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    return this.tasksService.findAll(userId);
  }

  /**
   * GET /tasks/:id
   *
   * Retrieve one task belonging to the current user.
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
   *
   * Update selected fields of an owned task.
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

    // Prepare only the fields actually provided.
    const input: UpdateTaskInput = {};

    // Update the title when provided.
    if (dto.title !== undefined) {
      input.title = dto.title;
    }

    // Null clears the existing description.
    if (dto.description !== undefined) {
      input.description = dto.description;
    }

    // Update the task status when provided.
    if (dto.status !== undefined) {
      input.status = dto.status;
    }

    // Convert deadline text or clear it with null.
    if (dto.dueDate !== undefined) {
      input.dueDate =
        dto.dueDate === null
          ? null
          : new Date(dto.dueDate);
    }

    // Reject requests containing no update values.
    // Check input instead of dto to avoid undefined
    // class properties affecting empty-body validation.
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
   * Permanently remove an owned task.
   *
   * Successful deletion returns HTTP 204
   * without any JSON response body.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' }))
    taskId: string,
  ) {
    // Obtain the authenticated user's ID.
    const userId = request.user?.id;

    // Reject requests without a verified user.
    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    // Delete only if the task belongs to this user.
    await this.tasksService.deleteTask(userId, taskId);

    // HTTP 204 No Content.
  }
}
