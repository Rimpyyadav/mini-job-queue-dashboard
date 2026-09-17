export const JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface Job {
  id: string;
  title: string;
  type: string;
  status: JobStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type JobCounts = Record<JobStatus | 'total', number>;

/**
 * Mirror of the server's state machine, used only to decide which buttons to
 * show. The server enforces the same rule independently — see README.
 */
export const NEXT_STATUSES: Record<JobStatus, JobStatus[]> = {
  pending: ['running'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};
