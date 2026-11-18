import type { ReactNode } from 'react';
import { NotFoundError } from '../lib/data';

export function Loading({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-28 animate-pulse bg-ink-850/60" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-base font-medium text-fg">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-xl text-sm text-fg-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  if (error instanceof NotFoundError) {
    return (
      <EmptyState title="No data has been published yet">
        The daily pipeline has not produced a dataset yet. Once the GitHub Actions workflow runs (daily at 07:00 IST, or manually), verified records will appear here. No placeholder or invented content is shown in the meantime.
      </EmptyState>
    );
  }
  return (
    <EmptyState title="Could not load data">
      {error.message}. Please retry later; the last successful dataset remains available once the connection is restored.
    </EmptyState>
  );
}
