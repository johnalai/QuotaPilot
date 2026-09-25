'use client';

import { useActionState } from 'react';

import { createOpportunityAction } from '@/app/(dashboard)/opportunities/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface NewOpportunityFormProps {
  /** The caller's accounts — the only ones an opportunity may be attached to. */
  accounts: Array<{ id: string; name: string }>;
}

/**
 * New-opportunity form (client island). The mutation is a Server Action, so the
 * browser never sends an org id or an owner id — both come from the session.
 *
 * Amount is entered in whole currency units and converted to integer minor units
 * by the action; money is never a float anywhere in the pipeline.
 */
export function NewOpportunityForm({ accounts }: NewOpportunityFormProps) {
  const [state, formAction, pending] = useActionState(createOpportunityAction, null);

  if (accounts.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        Add an account first — an opportunity must belong to one.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Add an opportunity</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={200} placeholder="Renewal — Acme" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountId">Account</Label>
          <select
            id="accountId"
            name="accountId"
            required
            defaultValue=""
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="" disabled>
              Select an account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            required
            inputMode="decimal"
            placeholder="12500.50"
            aria-describedby="amount-hint"
          />
          <p id="amount-hint" className="text-xs text-muted-foreground">
            Whole currency units, e.g. 12500.50
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="closeDate">Close date</Label>
          <Input id="closeDate" name="closeDate" type="date" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stage">Stage</Label>
          <select
            id="stage"
            name="stage"
            defaultValue="prospecting"
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="prospecting">Prospecting</option>
            <option value="qualified">Qualified</option>
            <option value="proposal">Proposal</option>
            <option value="negotiation">Negotiation</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create opportunity'}
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
