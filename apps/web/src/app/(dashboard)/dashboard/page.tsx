import { TodayPlanCard } from '@/features/actions';
import { QuotaProgressCard } from '@/features/quota';
import { RiskSnapshotCard } from '@/features/weekly-review';

/**
 * Today: action plan, quota progress rail, forecast/risk snapshot. Composes
 * feature cards (route-map §3.1). Data lands Phase 3 — cards are placeholder
 * shells until then.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <QuotaProgressCard />
        <TodayPlanCard />
        <RiskSnapshotCard />
      </div>
    </div>
  );
}
