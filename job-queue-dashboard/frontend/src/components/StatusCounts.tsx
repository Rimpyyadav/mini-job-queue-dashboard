import type { JobCounts, JobStatus } from '../lib/types';
import { JOB_STATUSES } from '../lib/types';

interface Props {
  counts: JobCounts;
  active: JobStatus | 'all';
  onSelect: (filter: JobStatus | 'all') => void;
}

const LABELS: Record<JobStatus | 'all', string> = {
  all: 'All jobs',
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

/** Counts double as the status filter — one control instead of two. */
export function StatusCounts({ counts, active, onSelect }: Props) {
  const options: Array<JobStatus | 'all'> = ['all', ...JOB_STATUSES];

  return (
    <div className="counts" role="group" aria-label="Filter jobs by status">
      {options.map((option) => {
        const value = option === 'all' ? counts.total : counts[option];
        const isActive = active === option;
        return (
          <button
            key={option}
            type="button"
            className={`count count-${option}${isActive ? ' is-active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onSelect(option)}
          >
            <span className="count-value">{value}</span>
            <span className="count-label">{LABELS[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
