import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './lib/api';
import type { Job, JobCounts, JobStatus } from './lib/types';
import { CreateJobForm } from './components/CreateJobForm';
import { JobTable } from './components/JobTable';
import { StatusCounts } from './components/StatusCounts';
import { Notice } from './components/Notice';

type Filter = JobStatus | 'all';

const EMPTY_COUNTS: JobCounts = {
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  total: 0,
};

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<JobCounts>(EMPTY_COUNTS);
  const [filter, setFilter] = useState<Filter>('all');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'warn' | 'info'; text: string } | null>(null);

  // Ids with an action in flight, so their buttons can be disabled individually.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Guards against an older response overwriting a newer one.
  const requestId = useRef(0);

  const load = useCallback(
    async (nextFilter: Filter, { silent = false } = {}) => {
      const id = ++requestId.current;
      if (!silent) setLoading(true);

      try {
        const [jobList, stats] = await Promise.all([
          api.listJobs(nextFilter),
          api.stats(),
        ]);
        if (id !== requestId.current) return; // a newer load already finished
        setJobs(jobList);
        setCounts(stats);
        setLoadError(null);
      } catch (error) {
        if (id !== requestId.current) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load jobs.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  // Poll so a second tab sees changes without a manual refresh.
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => void load(filter, { silent: true }), 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, filter, load]);

  const markBusy = (id: string, value: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      value ? next.add(id) : next.delete(id);
      return next;
    });

  const handleCreate = async (input: { title: string; type: string }) => {
    await api.createJob(input);
    setNotice(null);
    await load(filter, { silent: true });
  };

  const handleStatusChange = async (job: Job, status: JobStatus) => {
    markBusy(job.id, true);
    try {
      await api.updateStatus(job.id, status, job.version);
      setNotice(null);
    } catch (error) {
      if (error instanceof ApiError && (error.isConflict || error.isGone)) {
        // Someone else got there first. Tell the user what happened rather than
        // leaving a button that silently does nothing, and resync.
        setNotice({ tone: 'warn', text: error.message });
      } else {
        setNotice({
          tone: 'warn',
          text: error instanceof Error ? error.message : 'Could not update this job.',
        });
      }
    } finally {
      markBusy(job.id, false);
      await load(filter, { silent: true });
    }
  };

  const handleDelete = async (job: Job) => {
    markBusy(job.id, true);
    try {
      await api.deleteJob(job.id);
      setNotice(null);
    } catch (error) {
      setNotice({
        tone: 'warn',
        text:
          error instanceof ApiError && error.isGone
            ? 'That job had already been deleted.'
            : error instanceof Error
              ? error.message
              : 'Could not delete this job.',
      });
    } finally {
      markBusy(job.id, false);
      await load(filter, { silent: true });
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Job queue</h1>
        <div className="head-actions">
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Refresh every 5s
          </label>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void load(filter)}
            disabled={loading}
          >
            Refresh now
          </button>
        </div>
      </header>

      <StatusCounts counts={counts} active={filter} onSelect={setFilter} />

      <CreateJobForm onCreate={handleCreate} />

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {loadError ? (
        <div className="panel panel-error">
          <p>{loadError}</p>
          <button type="button" className="btn" onClick={() => void load(filter)}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <p className="muted">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <p className="muted">
          {filter === 'all'
            ? 'No jobs yet. Create one above to get started.'
            : `No ${filter} jobs right now.`}
        </p>
      ) : (
        <JobTable
          jobs={jobs}
          busyIds={busy}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
