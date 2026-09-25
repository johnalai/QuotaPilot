'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createOpportunity } from '@/features/opportunities/service';
import { getSessionServer } from '@/lib/auth/session';
import { toApiError, type ApiErrorShape } from '@/lib/errors';
import { toMinorUnits } from '@/lib/utils/format-currency';

/**
 * Server Action: create an opportunity (route-map §5 `CREATE_OPPORTUNITY`).
 *
 * Bound to the form via `useActionState`, so validation failures come back as an
 * error shape instead of a thrown error. Two fields are deliberately taken from
 * the session rather than the form: the org (inside the service) and the owner.
 */
export async function createOpportunityAction(
  _prev: ApiErrorShape | null,
  formData: FormData,
): Promise<ApiErrorShape | null> {
  const ctx = await getSessionServer();
  if (!ctx) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not signed in' } };
  }

  // An empty amount must fail validation, not silently become 0.
  const rawAmount = String(formData.get('amount') ?? '').trim();
  const amount = rawAmount === '' ? Number.NaN : toMinorUnits(rawAmount);

  try {
    await createOpportunity(ctx, {
      accountId: String(formData.get('accountId') ?? ''),
      name: String(formData.get('name') ?? '').trim(),
      stage: String(formData.get('stage') ?? 'prospecting'),
      amount,
      closeDate: String(formData.get('closeDate') ?? ''),
      // The acting user owns what they create. The form has no owner field, so a
      // browser cannot reassign ownership.
      ownerId: ctx.userId,
    });
  } catch (error) {
    return toApiError(error);
  }

  revalidatePath('/opportunities');
  redirect('/opportunities');
}
