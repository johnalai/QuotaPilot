import { AppShell } from '@/components/layout';

/**
 * Authenticated product shell (`(dashboard)` group): shared chrome only, plus
 * children. Per route-map §1, post-Phase 1 this layout (or middleware) gates on
 * session → org → onboarding before rendering the shell.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
