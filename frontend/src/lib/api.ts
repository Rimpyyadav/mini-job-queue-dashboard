import type { Job, JobCounts, JobStatus } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** An error carrying everything the server told us about why it said no. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the job changed underneath us — another tab, or a direct API call. */
  get isConflict() {
    return this.status === 409;
  }

  get isGone() {
    return this.status === 404;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    // fetch only rejects for network-level failures, not HTTP error codes.
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Validation errors arrive as an array of strings; everything else as one string.
    const raw = (body as { message?: string | string[] }).message;
    const message = Array.isArray(raw) ? raw.join('. ') : (raw ?? 'Something went wrong.');
    throw new ApiError(message, response.status, body as Record<string, unknown>);
  }

  return body as T;
}

export const api = {
  listJobs: (status?: JobStatus | 'all') =>
    request<Job[]>(`/jobs${status && status !== 'all' ? `?status=${status}` : ''}`),

  stats: () => request<JobCounts>('/jobs/stats'),

  createJob: (input: { title: string; type: string }) =>
    request<Job>('/jobs', { method: 'POST', body: JSON.stringify(input) }),

  /**
   * expectedVersion is the version this tab last saw. The server rejects the
   * change if the job has moved on since, so a stale tab cannot overwrite a
   * newer state even when the transition itself would be legal.
   */
  updateStatus: (id: string, status: JobStatus, expectedVersion: number) =>
    request<Job>(`/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, expectedVersion }),
    }),

  deleteJob: (id: string) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
};
