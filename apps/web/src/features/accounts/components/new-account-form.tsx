'use client';

import { useActionState } from 'react';

import { createAccountAction } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * New-account form (client island). The mutation itself is a Server Action, so
 * the browser never touches the database and `organizationId` is never sent.
 */
export function NewAccountForm() {
  const [state, formAction, pending] = useActionState(createAccountAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Add an account</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={200} placeholder="Acme Corp" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" name="industry" maxLength={120} placeholder="SaaS" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="segment">Segment</Label>
          <Input id="segment" name="segment" maxLength={80} placeholder="Enterprise" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stage">Stage</Label>
          <select
            id="stage"
            name="stage"
            defaultValue="new"
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="new">New</option>
            <option value="active">Active</option>
            <option value="at_risk">At risk</option>
            <option value="churned">Churned</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </Button>
        {state && !state.ok && (
          <p className="text-sm text-destructive" role="alert">
            {state.error.message}
          </p>
        )}
      </div>
    </form>
  );
}
