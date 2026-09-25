'use client';

import { useActionState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerAction } from '@/app/(auth)/register/actions';

import type { ApiErrorShape } from '@/lib/errors';

/**
 * Interactive sign-up form (client island). The form state is driven by the
 * Server Action's return value — no client-side auth logic, no secrets.
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState<ApiErrorShape | null, FormData>(
    registerAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the form on success so a stray error doesn't linger on reload.
  // Note: registerAction redirects on success, so this effect runs on mount
  // after a redirect (page reload) or if state was set from a previous attempt.
  useEffect(() => {
    if (!state) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" type="text" required disabled={pending} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required disabled={pending} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="organizationName">Organization</Label>
        <Input
          id="organizationName"
          name="organizationName"
          type="text"
          required
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          disabled={pending}
          minLength={8}
        />
      </div>

      {state && (
        <p role="alert" className="text-sm text-destructive">
          {state.error.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account...' : 'Create account'}
      </Button>
    </form>
  );
}
