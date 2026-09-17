import type { Job, JobStatus } from '../lib/types';
import { NEXT_STATUSES } from '../lib/types';

interface Props {
  jobs: Job[];
  busyIds: Set<string>;
  onStatusChange: (job: Job, status: JobStatus) => void;
  onDelete: (job: Job) => void;
}

const ACTION_LABELS: Record<JobStatus, string> = {
  pending: 'Reset to pending',
  running: 'Start',
  completed: 'Mark completed',
  failed: 'Mark failed',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function JobTable({ jobs, busyIds, onStatusChange, onDelete }: Props) {
  return (
    <table className="jobs">
      <thead>
        <tr>
          <th>Job</th>
          <th>Status</th>
          <th>Created</th>
          <th className="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => {
          const busy = busyIds.has(job.id);
          const moves = NEXT_STATUSES[job.status];

          return (
            <tr key={job.id} className={busy ? 'is-busy' : undefined}>
              <td>
                <span className="job-title">{job.title}</span>
                <span className="job-type">{job.type}</span>
              </td>
              <td>
                <span className={`pill pill-${job.status}`}>{job.status}</span>
              </td>
              <td className="muted">{formatTime(job.createdAt)}</td>
              <td className="col-actions">
                {moves.length > 0 ? (
                  moves.map((next) => (
                    <button
                      key={next}
                      type="button"
                      className={`btn btn-${next}`}
                      disabled={busy}
                      onClick={() => onStatusChange(job, next)}
                    >
                      {ACTION_LABELS[next]}
                    </button>
                  ))
                ) : (
                  <span className="muted">No further changes</span>
                )}
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={busy}
                  onClick={() => onDelete(job)}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
