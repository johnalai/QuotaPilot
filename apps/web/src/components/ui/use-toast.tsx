'use client';

import * as React from 'react';

import { Toast } from '@base-ui/react/toast';

import { cn } from 'cn';

/**
 * Toast built on Base UI's `Toast` primitive.
 *
 * Exposes the imperative shadcn-style `toast({ title, description, variant })`
 * that pages already call, backed by a shared toast manager. Mount `<Toaster />`
 * once (root layout) — without it, toasts are added but never rendered.
 */

export type ToastVariant = 'default' | 'destructive';

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
}

/** Shared manager — module scope so `toast()` works outside React. */
export const toastManager = Toast.createToastManager();

/** Imperative API: `toast({ title, description, variant: 'destructive' })`. */
export function toast({ title, description, variant = 'default' }: ToastOptions): string {
  return toastManager.add({
    title,
    description,
    type: variant === 'destructive' ? 'error' : 'success',
  });
}

export function useToast() {
  return { toast, toastManager };
}

/** Renders queued toasts. Mount once, in the root layout. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <ToastViewport />
    </Toast.Provider>
  );
}

/**
 * Inner component — `useToastManager()` reads from context, so it must render
 * *inside* `<Toast.Provider>`. Calling it in `Toaster` itself throws
 * "useToastManager must be used within <Toast.Provider>".
 */
function ToastViewport() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport
        data-slot="toaster"
        className="fixed bottom-0 right-0 z-100 flex w-full max-w-sm flex-col gap-2 p-4 outline-none"
      >
        {toasts.map((toastItem) => (
          <Toast.Root
            key={toastItem.id}
            toast={toastItem}
            className={cn(
              'relative rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg',
              'data-[type=error]:border-destructive data-[type=error]:text-destructive',
            )}
          >
            <Toast.Title data-slot="toast-title" className="text-sm font-medium" />
            <Toast.Description
              data-slot="toast-description"
              className="mt-1 text-sm text-muted-foreground"
            />
            <Toast.Close
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded-md px-1 text-muted-foreground hover:text-foreground"
            />
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
