import * as React from 'react';

import { cn } from 'cn';

/**
 * Text input (shadcn/ui-style primitive, built on a plain <input>).
 *
 * Deliberately framework-free: no Base UI, no Radix. The app only needs a
 * handful of form primitives and this keeps the bundle small. Accessibility
 * is via native semantics + the label association below.
 */
function Input({ className, type = 'text', ...props }: React.ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
