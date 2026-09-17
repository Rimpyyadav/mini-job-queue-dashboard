import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JOB_STATUSES, JobStatus } from '../job-status';

export class UpdateJobStatusDto {
  @IsIn(JOB_STATUSES, {
    message: `status must be one of: ${JOB_STATUSES.join(', ')}`,
  })
  status!: JobStatus;

  /**
   * Optional optimistic-concurrency check. If the client sends the version it
   * last saw, the update is rejceted with 409 when the job has changed since —
   * even if the transition itself would have been legal.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
