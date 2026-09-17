import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobStatus } from './job-status';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 60 })
  type!: string;

  /**
   * Stored as a plain string rather than a native enum so the same entity works
   * on both SQLite and Postgres. Values are constrained by the DTO on the way in
   * and by the guarded UPDATE on every change.
   */
  @Index()
  @Column({ type: 'varchar', length: 20, default: JobStatus.PENDING })
  status!: JobStatus;

  /**
   * Incremented on every status change. Not a TypeORM @VersionColumn, because
   * TypeORM would then manage it and refuse the manual increment used by the
   * atomic update. Exposed to clients so a stale tab can detect it is stale.
   */
  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * Append-only log of every accepted status change. Written inside the same
 * transaction as the change itself, so the log can never disagree with the job.
 * This is the "production-ready" extra described in the README.
 */
@Entity('job_transitions')
export class JobTransition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
   @Column({ type: 'uuid' })
  jobId!: string;

  @ManyToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job?: Job;

  @Column({ type: 'varchar', length: 20 })
  fromStatus!: JobStatus;

  @Column({ type: 'varchar', length: 20 })
  toStatus!: JobStatus;

  /** Version of the job after this transition was applied. */
  @Column({ type: 'int' })
  toVersion!: number;

  @CreateDateColumn()
  occurredAt!: Date;
}
