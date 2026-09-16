import { formatMinorUnits } from '@quotapilot/domain';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const mvpModules = [
  {
    name: 'Onboarding & ramp plan',
    detail: '30 / 60 / 90 — a flight plan for your first quarters',
  },
  { name: 'Quota calculator', detail: 'Editable conversion rates, deterministic funnel math' },
  { name: 'Accounts & opportunities', detail: 'Prioritization with computed health' },
  { name: 'Daily action plan', detail: 'What to do today, why, and the quota impact' },
  { name: 'Discovery-call coach', detail: 'Prep and objection practice before the call' },
  { name: 'Weekly review', detail: 'What worked, what did not, what changes' },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          QuotaPilot
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Flight plan for your quota.
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Know what to do today, why it matters, and how it affects the probability of reaching
          quota.
        </p>
      </div>

      <section className="mt-16 w-full max-w-3xl" aria-label="MVP modules">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mvpModules.map((mod) => (
            <Card key={mod.name}>
              <CardHeader>
                <CardTitle>{mod.name}</CardTitle>
                <CardDescription>{mod.detail}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-16 text-sm tabular-nums text-muted-foreground">
        Core wiring live · domain rules: {formatMinorUnits(12_500_00, 'USD')}
      </p>
    </main>
  );
}
