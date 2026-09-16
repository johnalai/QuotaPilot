import {
  Building2,
  CalendarCheck,
  LayoutDashboard,
  ListChecks,
  Mic,
  Rocket,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

/** A single entry in the authenticated shell's sidebar. */
export interface AppNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Sidebar navigation for the `(dashboard)` shell. Declarative config only —
 * no sales-domain logic lives here (shared UI rule, CLAUDE.md §3.6 / rule 4).
 * Routes map to route-map §3.
 */
export const appNavItems: AppNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Ramp', href: '/ramp', icon: Rocket },
  { label: 'Quota', href: '/quota', icon: Target },
  { label: 'Accounts', href: '/accounts', icon: Building2 },
  { label: 'Opportunities', href: '/opportunities', icon: TrendingUp },
  { label: 'Actions', href: '/actions', icon: ListChecks },
  { label: 'Call coach', href: '/call-coach', icon: Mic },
  { label: 'Weekly review', href: '/weekly-review', icon: CalendarCheck },
];
