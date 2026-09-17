import {
  JobStatus,
  canTransition,
  isTerminal,
  nextStatuses,
} from '../src/jobs/job-status';

describe('job state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition(JobStatus.PENDING, JobStatus.RUNNING)).toBe(true);
    expect(canTransition(JobStatus.RUNNING, JobStatus.COMPLETED)).toBe(true);
    expect(canTransition(JobStatus.RUNNING, JobStatus.FAILED)).toBe(true);
  });

  it('refuses to restart a finished job', () => {
    expect(canTransition(JobStatus.COMPLETED, JobStatus.RUNNING)).toBe(false);
    expect(canTransition(JobStatus.FAILED, JobStatus.RUNNING)).toBe(false);
  });

  it('refuses to skip the running state', () => {
    expect(canTransition(JobStatus.PENDING, JobStatus.COMPLETED)).toBe(false);
    expect(canTransition(JobStatus.PENDING, JobStatus.FAILED)).toBe(false);
  });

  it('never goes back to pending', () => {
    for (const from of Object.values(JobStatus)) {
      expect(canTransition(from, JobStatus.PENDING)).toBe(false);
    }
  });

  it('refuses a no-op transition to the same status', () => {
    for (const status of Object.values(JobStatus)) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('reports terminal states', () => {
    expect(isTerminal(JobStatus.COMPLETED)).toBe(true);
    expect(isTerminal(JobStatus.FAILED)).toBe(true);
    expect(isTerminal(JobStatus.PENDING)).toBe(false);
    expect(isTerminal(JobStatus.RUNNING)).toBe(false);
  });

  it('exposes the moves available from each state, for the UI', () => {
    expect(nextStatuses(JobStatus.PENDING)).toEqual([JobStatus.RUNNING]);
    expect(nextStatuses(JobStatus.RUNNING)).toEqual([
      JobStatus.COMPLETED,
      JobStatus.FAILED,
    ]);
    expect(nextStatuses(JobStatus.COMPLETED)).toEqual([]);
    expect(nextStatuses(JobStatus.FAILED)).toEqual([]);
  });
});
