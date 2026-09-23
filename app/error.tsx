'use client';

import { ErrorState } from '@/components/shared/error-state';

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg p-4 pt-16">
      <ErrorState reset={reset} />
    </div>
  );
}
