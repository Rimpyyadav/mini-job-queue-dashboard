import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { TransactionRunner } from '../common/transaction-runner';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsDto } from './dto/find-jobs.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { Job, JobTransition } from './job.entity';
import {
  ALLOWED_PREDECESSORS,
  JOB_STATUSES,
  JobStatus,
  isTerminal,
  nextStatuses,
} from './job-status';

export type JobCounts = Record<JobStatus | 'total', number>;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tx: TransactionRunner,
  ) {}

  async create(dto: CreateJobDto): Promise<Job> {
    const job = this.jobs.create({
      title: dto.title,
      type: dto.type,
      status: JobStatus.PENDING,
      version: 1,
    });
    return this.jobs.save(job);
  }

  async findAll(query: FindJobsDto): Promise<Job[]> {
    return this.jobs.find({
      where: query.status ? { status: query.status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`No job with id "${id}"`);
    return job;
  }

  async counts(): Promise<JobCounts> {
    const rows: Array<{ status: JobStatus; count: string }> = await this.jobs
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('job.status')
      .getRawMany();

    const counts = Object.fromEntries(
      JOB_STATUSES.map((s) => [s, 0]),
    ) as JobCounts;
    counts.total = 0;

    for (const row of rows) {
      const n = Number(row.count);
      counts[row.status] = n;
      counts.total += n;
    }
    return counts;
  }

  /**
   * The interesting one.
   *
   * The transition rule is enforced by a single guarded UPDATE:
   *
   *   UPDATE jobs SET status = $next, version = version + 1
   *   WHERE id = $id AND status IN ($allowedPredecessors)
   *
   * The database evaluates the WHERE clause and writes the row under the same
   * row lock, so two concurrent requests cannot both observe `pending` and both
   * win. Exactly one gets affected = 1; the loser gets affected = 0 and a 409.
   *
   * A read-then-write (findOne, check in JS, save) would NOT be safe here: both
   * requests could read `pending` before either writes.
   */
  async updateStatus(id: string, dto: UpdateJobStatusDto): Promise<Job> {
    const next = dto.status;
    const allowedFrom = ALLOWED_PREDECESSORS[next];

    // No status can legally lead to `pending`, so skip the round trip.
    if (allowedFrom.length === 0) {
      const current = await this.findOne(id);
      throw this.conflict(current, next);
    }

    return this.tx.run(async (manager: EntityManager) => {
      const qb = manager
        .createQueryBuilder()
        .update(Job)
        .set({
          status: next,
          version: () => '"version" + 1',
        })
        .where('id = :id', { id })
        .andWhere('status IN (:...allowedFrom)', { allowedFrom });

      // Optional optimistic check: reject if the job moved since the client read it.
      if (dto.expectedVersion !== undefined) {
        qb.andWhere('version = :expectedVersion', {
          expectedVersion: dto.expectedVersion,
        });
      }

      const result = await qb.execute();

      if (!result.affected) {
        // The update matched nothing. Work out which of the three reasons it was
        // so the client gets an accurate error instead of a generic failure.
        const current = await manager.findOne(Job, { where: { id } });
        if (!current) throw new NotFoundException(`No job with id "${id}"`);
        throw this.conflict(current, next, dto.expectedVersion);
      }

      const updated = await manager.findOneOrFail(Job, { where: { id } });

      await manager.insert(JobTransition, {
        jobId: updated.id,
        // The only status that could have satisfied the guard, unless the rule
        // has several predecessors — in which case we derive it from the log.
        fromStatus:
          allowedFrom.length === 1 ? allowedFrom[0] : await this.previousStatus(manager, id),
        toStatus: next,
        toVersion: updated.version,
      });

      this.logger.log(`job ${id} -> ${next} (v${updated.version})`);
      return updated;
    });
  }

  async remove(id: string): Promise<void> {
    const result = await this.jobs.delete({ id });
    if (!result.affected) throw new NotFoundException(`No job with id "${id}"`);
  }

  async history(id: string): Promise<JobTransition[]> {
    await this.findOne(id); // 404 if the job does not exist
    return this.dataSource.getRepository(JobTransition).find({
      where: { jobId: id },
      order: { occurredAt: 'ASC' },
    });
  }

  private async previousStatus(
    manager: EntityManager,
    jobId: string,
  ): Promise<JobStatus> {
    const last = await manager.findOne(JobTransition, {
      where: { jobId },
      order: { occurredAt: 'DESC' },
    });
    return last?.toStatus ?? JobStatus.PENDING;
  }

  private conflict(
    current: Job,
    attempted: JobStatus,
    expectedVersion?: number,
  ): ConflictException {
    const allowed = nextStatuses(current.status);

    let reason: string;
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      reason =
        `This job has changed since you loaded it ` +
        `(you had version ${expectedVersion}, it is now version ${current.version}).`;
    } else if (current.status === attempted) {
      reason = `This job is already ${attempted}.`;
    } else if (isTerminal(current.status)) {
      reason = `This job is ${current.status} and cannot change status again.`;
    } else {
      reason = `A job cannot go from ${current.status} to ${attempted}.`;
    }

    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: reason,
      currentStatus: current.status,
      currentVersion: current.version,
      attemptedStatus: attempted,
      allowedTransitions: allowed,
    });
  }
}
