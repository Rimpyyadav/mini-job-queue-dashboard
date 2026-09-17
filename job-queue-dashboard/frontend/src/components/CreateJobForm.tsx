import { useState } from 'react';

interface Props {
  onCreate: (input: { title: string; type: string }) => Promise<void>;
}

const TYPES = ['email', 'report', 'export', 'cleanup', 'sync'];

export function CreateJobForm({ onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give the job a title.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ title: trimmed, type });
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the job.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel create">
      <div className="create-fields">
        <label className="field">
          <span>Title</span>
          <input
            value={title}
            maxLength={120}
            placeholder="Send weekly digest"
            onChange={(event) => {
              setTitle(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !submitting) void submit();
            }}
          />
        </label>

        <label className="field field-type">
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create job'}
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
