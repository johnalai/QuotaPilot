'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAccount } from '@/features/accounts/service';
import { getSessionServer } from '@/lib/auth/session';
import { toApiError, type ApiErrorShape } from '@/lib/errors';

/**
 * Server Action: create an account (route-map §5 `CREATE_ACCOUNT`).
 *
 * Bound to the new-account form via `useActionState`, so validation failures
 * come back as an error shape rather than a thrown error. Success hard-redirects
 * to the list, which keeps the redirect out of the action's return type.
 */
export async function createAccountAction(
  _prev: ApiErrorShape | null,
  formData: FormData,
): Promise<ApiErrorShape | null> {
  const ctx = await getSessionServer();
  if (!ctx) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not signed in' } };
  }

  const optional = (key: string) => {
    const value = String(formData.get(key) ?? '').trim();
    return value.length > 0 ? value : undefined;
  };

  try {
    await createAccount(ctx, {
      name: String(formData.get('name') ?? '').trim(),
      industry: optional('industry'),
      segment: optional('segment'),
      stage: String(formData.get('stage') ?? 'new'),
    });
  } catch (error) {
    return toApiError(error);
  }

  revalidatePath('/accounts');
  redirect('/accounts');
}
