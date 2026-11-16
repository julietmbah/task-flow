
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * UpdateTaskDto
 *
 * Defines which task fields a user may update.
 *
 * All fields are optional because PATCH performs
 * partial updates.
 *
 * Task ownership is never supplied by the client.
 */
export class UpdateTaskDto {
  /**
   * Optional task title.
   * If provided, it must contain meaningful text.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'Task title cannot contain only whitespace.',
  })
  @MaxLength(200)
  title?: string;

  /**
   * Optional task description.
   *
   * Send null to clear the description.
   */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  /**
   * Optional task status.
   *
   * Only our three supported statuses are allowed.
   * Null is rejected.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['TODO', 'IN_PROGRESS', 'COMPLETED'])
  status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';

  /**
   * Optional task deadline.
   *
   * Must be ISO 8601 when provided.
   * Send null to remove the deadline.
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string | null;
}
