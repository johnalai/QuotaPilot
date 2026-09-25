import { redirect } from 'next/navigation';

import { getDashboardData } from '@/features/dashboard/service';
import { getSessionServer } from '@/lib/auth/session';
import { TodayPlanCard } from '@/features/actions';
import { QuotaProgressCard } from '@/features/quota';
import { RiskSnapshotCard } from '@/features/weekly-review';

/**
 * Dashboard (route-map §2.3).
 *
 * Server component: resolves the tenant context from the session, then reads
 * the computed aggregates through the repository layer (which sets the
 * transaction-scoped RLS claim). The cards are presentational — they receive
 * numbers, never ids.
 */
export default async function DashboardPage() {
  const ctx = await getSessionServer();
  if (!ctx) {
    redirect('/login');
  }

  const data = await getDashboardData(ctx);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        {data.quota ? (
          <QuotaProgressCard
            quotaAmount={data.quota.quotaAmount}
            pipeline={data.quota.pipeline}
            weightedPipeline={data.quota.weightedPipeline}
            coverage={data.quota.coverage}
            attainment={data.quota.attainment}
            currency={data.quota.currency}
          />
        ) : (
          <QuotaProgressCard
            quotaAmount={0}
            pipeline={0}
            weightedPipeline={0}
            coverage={0}
            attainment={0}
            currency="USD"
          />
        )}
        <TodayPlanCard tasks={data.todayPlan} />
        <RiskSnapshotCard
          forecast={data.forecast}
          riskCount={data.riskCount}
          topDeals={data.topDeals}
        />
      </div>
    </div>
  );
}