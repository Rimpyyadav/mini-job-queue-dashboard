import type { ReactNode } from 'react';

interface Props {
  tone: 'warn' | 'info';
  children: ReactNode;
  onDismiss: () => void;
}

export function Notice({ tone, children, onDismiss }: Props) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      <p>{children}</p>
      <button type="button" className="btn btn-quiet" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
