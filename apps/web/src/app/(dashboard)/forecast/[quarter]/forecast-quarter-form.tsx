'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toMajorUnitsInput, toMinorUnits } from '@/lib/utils/format-currency';

export interface ForecastQuarterRow {
  month: string;
  label: string;
  /** Computed from committed pipeline — derived, never editable. */
  computedAmount: number;
  computedWeighted: number;
  confidence: number;
  opportunityCount: number;
  /** Explicit seller override (minor units), 0 when unset. */
  committed: number;
  bestCase: number;
  pipeline: number;
  hasOverride: boolean;
  /** Id of the stored override row, so it can be cleared. Null when unset. */
  overrideId: string | null;
}

interface Draft {
  committed: string;
  bestCase: string;
  pipeline: string;
}

type Status = { kind: 'ok' | 'error'; text: string } | null;

function draftFrom(row: ForecastQuarterRow): Draft {
  return {
    committed: toMajorUnitsInput(row.committed),
    bestCase: toMajorUnitsInput(row.bestCase),
    pipeline: toMajorUnitsInput(row.pipeline),
  };
}

function initialDrafts(rows: ForecastQuarterRow[]): Record<string, Draft> {
  return Object.fromEntries(rows.map((row) => [row.month, draftFrom(row)]));
}

/**
 * Client island for the quarter drill-down.
 *
 * The form edits the explicit override only. It mirrors — but does not replace —
 * the server-side invariant `committed ≤ bestCase ≤ pipeline`, which is enforced
 * authoritatively in `PATCH /api/forecast/values`. Nothing here writes a
 * computed figure.
 *
 * Deliberately depends only on the UI primitives that exist in
 * `components/ui` (Button, Input, Label) — no toast provider is installed yet.
 */
export function ForecastQuarterForm({
  quarter,
  rows,
}: {
  quarter: string;
  rows: ForecastQuarterRow[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => initialDrafts(rows));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  function setField(month: string, field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [month]: { ...prev[month], [field]: value } }));
    setStatus(null);
  }

  /** Client-side mirror of the server invariant; returns an error or null. */
  function validate(draft: Draft): string | null {
    const committed = toMinorUnits(draft.committed);
    const bestCase = toMinorUnits(draft.bestCase);
    const pipeline = toMinorUnits(draft.pipeline);

    if ([committed, bestCase, pipeline].some((v) => v < 0)) {
      return 'Values cannot be negative.';
    }
    if (committed > bestCase) return 'Committed cannot exceed best case.';
    if (bestCase > pipeline) return 'Best case cannot exceed pipeline.';
    return null;
  }

  const [clearing, setClearing] = useState<string | null>(null);

  /** Delete the stored override for a month, returning it to "no override". */
  async function handleClear(row: ForecastQuarterRow) {
    if (!row.overrideId) return;

    setClearing(row.month);
    setStatus(null);

    try {
      const res = await fetch(`/api/forecast/overrides/${row.overrideId}`, { method: 'DELETE' });
      const json = (await res.json()) as { ok: boolean; error?: { message?: string } };

      if (!json.ok) {
        setStatus({
          kind: 'error',
          text: `${row.label}: ${json.error?.message ?? 'clear failed'}`,
        });
        return;
      }

      setStatus({ kind: 'ok', text: `Cleared the override for ${row.label}.` });
      router.refresh();
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setClearing(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const original = initialDrafts(rows);

    const changed = rows.filter((row) => {
      const draft = drafts[row.month];
      const before = original[row.month];
      return (
        toMinorUnits(draft.committed) !== toMinorUnits(before.committed) ||
        toMinorUnits(draft.bestCase) !== toMinorUnits(before.bestCase) ||
        toMinorUnits(draft.pipeline) !== toMinorUnits(before.pipeline)
      );
    });

    if (changed.length === 0) {
      setStatus({ kind: 'ok', text: 'No changes to save.' });
      return;
    }

    for (const row of changed) {
      const error = validate(drafts[row.month]);
      if (error) {
        setStatus({ kind: 'error', text: `${row.label}: ${error}` });
        return;
      }
    }

    setSaving(true);
    setStatus(null);
    const failures: string[] = [];

    try {
      for (const row of changed) {
        const draft = drafts[row.month];
        const res = await fetch('/api/forecast/values', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month: row.month,
            committed: toMinorUnits(draft.committed),
            bestCase: toMinorUnits(draft.bestCase),
            pipeline: toMinorUnits(draft.pipeline),
          }),
        });

        const json = (await res.json()) as {
          ok: boolean;
          error?: { message?: string };
        };

        if (!json.ok) {
          failures.push(`${row.label}: ${json.error?.message ?? 'save failed'}`);
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Network error');
    } finally {
      setSaving(false);
    }

    if (failures.length > 0) {
      setStatus({
        kind: 'error',
        text: `Could not save ${failures.length} of ${changed.length} month(s) — ${failures.join(' · ')}`,
      });
    } else {
      setStatus({ kind: 'ok', text: `Saved ${changed.length} month(s).` });
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">Month</th>
              <th className="p-3 text-right font-medium">Computed</th>
              <th className="p-3 text-right font-medium">Weighted</th>
              <th className="p-3 text-right font-medium">Deals</th>
              <th className="p-3 text-left font-medium">Committed</th>
              <th className="p-3 text-left font-medium">Best case</th>
              <th className="p-3 text-left font-medium">Pipeline</th>
              <th className="p-3 text-right font-medium">Override</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.month];
              const rowError = validate(draft);

              return (
                <tr key={row.month} className="border-b last:border-b-0">
                  <td className="p-3">
                    <div className="font-medium">{row.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.hasOverride ? 'Override set' : 'No override'} ·{' '}
                      {(row.confidence * 100).toFixed(0)}% confidence
                    </div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{row.computedAmount / 100}</td>
                  <td className="p-3 text-right tabular-nums">{row.computedWeighted / 100}</td>
                  <td className="p-3 text-right tabular-nums">{row.opportunityCount}</td>
                  <td className="p-3">
                    <Label htmlFor={`committed-${row.month}`} className="sr-only">
                      Committed for {row.label}
                    </Label>
                    <Input
                      id={`committed-${row.month}`}
                      type="text"
                      inputMode="decimal"
                      value={draft.committed}
                      onChange={(e) => setField(row.month, 'committed', e.target.value)}
                      aria-invalid={Boolean(rowError)}
                      className="w-28"
                    />
                  </td>
                  <td className="p-3">
                    <Label htmlFor={`bestCase-${row.month}`} className="sr-only">
                      Best case for {row.label}
                    </Label>
                    <Input
                      id={`bestCase-${row.month}`}
                      type="text"
                      inputMode="decimal"
                      value={draft.bestCase}
                      onChange={(e) => setField(row.month, 'bestCase', e.target.value)}
                      aria-invalid={Boolean(rowError)}
                      className="w-28"
                    />
                  </td>
                  <td className="p-3">
                    <Label htmlFor={`pipeline-${row.month}`} className="sr-only">
                      Pipeline for {row.label}
                    </Label>
                    <Input
                      id={`pipeline-${row.month}`}
                      type="text"
                      inputMode="decimal"
                      value={draft.pipeline}
                      onChange={(e) => setField(row.month, 'pipeline', e.target.value)}
                      aria-invalid={Boolean(rowError)}
                      className="w-28"
                    />
                  </td>
                  <td className="p-3 text-right">
                    {row.overrideId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClear(row)}
                        disabled={clearing === row.month}
                      >
                        {clearing === row.month ? 'Clearing…' : 'Clear'}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Enter amounts in whole currency units. An override never changes the computed pipeline —
          it records what the seller commits to.
        </p>
        <div className="flex items-center gap-3">
          {status && (
            <p
              className={
                status.kind === 'ok' ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
              }
              role="status"
            >
              {status.text}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : `Save ${quarter} overrides`}
          </Button>
        </div>
      </div>
    </form>
  );
}
