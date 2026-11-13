
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * CreateTaskDto
 *
 * Defines the fields a client can submit
 * when creating a new task.
 *
 * Validation decorators will be enforced
 * through NestJS ValidationPipe.
 */
export class CreateTaskDto {
  /**
   * TASK TITLE
   *
   * Required.
   * Must be a string.
   * Cannot be empty or contain only spaces.
   * Maximum length: 200 characters.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'Task title cannot contain only whitespace.',
  })
  @MaxLength(200)
  title!: string;

  /**
   * TASK DESCRIPTION
   *
   * Optional.
   * Must be a string if provided.
   * Maximum length: 5000 characters.
   */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /**
   * TASK DEADLINE
   *
   * Optional.
   * Must be a valid ISO 8601 string if provided.
   *
   * Example:
   * 2026-11-01T12:00:00.000Z
   *
   * We will convert this string to a Date
   * before passing it to TasksService.
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;
}
