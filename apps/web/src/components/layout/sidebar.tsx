import Link from 'next/link';
import { LogOut } from 'lucide-react';

import { logout } from '@/app/(dashboard)/actions';
import { Button } from '@/components/ui/button';
import { appNavItems } from '@/config/navigation';

/**
 * Left sidebar for the authenticated shell. Renders declarative nav config
 * (config/navigation.ts) — no sales-domain logic, no data fetching.
 *
 * Sign-out is a Server Action bound to a plain form: no client island, and the
 * session cookie is cleared server-side.
 */
export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-6">
      <p className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        QuotaPilot
      </p>
      <nav className="mt-8 flex flex-col gap-1" aria-label="Product navigation">
        {appNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      <form action={logout} className="mt-auto pt-6">
        <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
          <LogOut className="size-4 shrink-0" />
          Sign out
        </Button>
      </form>
    </aside>
  );
}
