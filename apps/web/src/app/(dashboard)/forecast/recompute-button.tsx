'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

/**
 * Client island for the `RECOMPUTE` action (route-map §3.5).
 *
 * The forecast figures are derived on read, so recomputing is really "re-read
 * through the service". It goes through `POST /api/forecast/recompute` rather
 * than calling `router.refresh()` directly so the documented endpoint is the
 * one that gets exercised — and so the action has a real result to report.
 */
export function RecomputeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setMessage(null);

    try {
      const res = await fetch('/api/forecast/recompute', { method: 'POST' });
      const json = (await res.json()) as {
        ok: boolean;
        error?: { message?: string };
      };

      if (!json.ok) {
        setMessage(json.error?.message ?? 'Recompute failed.');
        return;
      }

      setMessage('Forecast recomputed.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      <Button variant="outline" onClick={handleClick} disabled={busy}>
        {busy ? 'Recomputing…' : 'Recompute'}
      </Button>
    </div>
  );
}
