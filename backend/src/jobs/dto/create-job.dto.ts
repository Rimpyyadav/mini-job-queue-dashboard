import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { JobStatus } from '../job-status';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateJobDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120, { message: 'title must be between 1 and 120 characters' })
  title!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 60, { message: 'type must be between 1 and 60 characters' })
  type!: string;

  /**
   * Optional. A job normally starts as pending; allowing an explicit status here
   * would let a client create a job that is already completed, so only pending
   * is accepted. Kept in the API so the field is documented rather than silently
   * ignored.
   */
  @IsOptional()
  @IsIn([JobStatus.PENDING], {
    message: 'a new job can only be created with status "pending"',
  })
  status?: JobStatus;
}
