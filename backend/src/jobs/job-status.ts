export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export const JOB_STATUSES: JobStatus[] = [
  JobStatus.PENDING,
  JobStatus.RUNNING,
  JobStatus.COMPLETED,
  JobStatus.FAILED,
];

/**
 * The state machine, expressed as "which statuses may a job be in immediately
 * before it enters this one".
 *
 *   pending -> running -> completed
 *                     -> failed
 *
 * It is written backwards (target -> allowed predecessors) on purpose: that is
 * exactly the shape needed for the guarded UPDATE in JobsService.updateStatus,
 * which is what makes the transition atomic. See README, "Concurrency".
 */
export const ALLOWED_PREDECESSORS: Record<JobStatus, JobStatus[]> = {
  // Nothing may return to pending. A job is created pending; it never goes back.
  [JobStatus.PENDING]: [],
  [JobStatus.RUNNING]: [JobStatus.PENDING],
  [JobStatus.COMPLETED]: [JobStatus.RUNNING],
  // Strict reading of the brief: only a running job can fail.
  // To also allow a pending job to be marked failed, add JobStatus.PENDING here
  // and nothing else in the codebase needs to change.
  [JobStatus.FAILED]: [JobStatus.RUNNING],
};

export const TERMINAL_STATUSES: JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.FAILED,
];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_PREDECESSORS[to].includes(from);
}

/** The statuses a job in `from` is allowed to move to. Used to drive the UI. */
export function nextStatuses(from: JobStatus): JobStatus[] {
  return JOB_STATUSES.filter((to) => canTransition(from, to));
}
