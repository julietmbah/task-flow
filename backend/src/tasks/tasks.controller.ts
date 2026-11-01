
import {
  Body,
  Controller,
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

import {
  TasksService,
  type CreateTaskInput,
} from './tasks.service.js';

/**
 * TasksController
 *
 * Handles incoming HTTP requests for tasks.
 *
 * Route prefix: /tasks
 */
@Controller('tasks')

// Protect all routes in this controller using JWT.
@UseGuards(JwtAuthGuard)
export class TasksController {
  /**
   * NestJS injects our task-management service.
   */
  constructor(private readonly tasksService: TasksService) {}

  /**
   * POST /tasks
   *
   * Creates a new task for the authenticated user.
   *
   * The client provides only task information.
   * The task owner's ID comes from the verified JWT.
   */
  @Post()
  async createTask(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateTaskDto,
  ) {
    // Our JWT guard places the verified user
    // information on request.user.
    const userId = request.user?.id;

    // Never create a task without a verified owner.
    if (!userId) {
      throw new UnauthorizedException(
        'Authenticated user not found.',
      );
    }

    // Prepare the task information for our service.
    const input: CreateTaskInput = {
      title: dto.title,
    };

    // Include the description only when provided.
    if (dto.description !== undefined) {
      input.description = dto.description;
    }

    // Convert the ISO date string into a Date object.
    // Prisma expects a JavaScript Date for dueDate.
    if (dto.dueDate !== undefined) {
      input.dueDate = new Date(dto.dueDate);
    }

    // Save the task under the authenticated user.
    return this.tasksService.createTask(userId, input);
  }
}
