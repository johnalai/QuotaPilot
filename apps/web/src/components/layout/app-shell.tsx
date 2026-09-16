import { Sidebar } from './sidebar';

export interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Authenticated application shell (`(dashboard)` group): sidebar + content.
 * Pure chrome — no domain logic, no data fetching. Session/org gating wraps
 * this in Phase 1 (route-map guard matrix).
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
