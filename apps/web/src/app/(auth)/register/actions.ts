'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/password';
import { toApiError, type ApiErrorShape } from '@/lib/errors';

/**
 * Server Action: create account → org (owner) → redirect to onboarding.
 *
 * Route-map §2.2: registration is the only path that creates an org, and the
 * creator is always its first owner. Errors are returned as the error envelope
 * so the form can display them without an exception boundary.
 *
 * Kept inline (not in a shared module) so argon2 (native) never enters the
 * client bundle — register-form.tsx imports this action directly.
 */
const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    email: z.string().trim().toLowerCase().email('A valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    organizationName: z.string().trim().min(1, 'Organization name is required').max(120),
  })
  .superRefine((input, ctx) => {
    if (!/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password must contain at least one letter and one number',
      });
    }
  });

export async function registerAction(
  _prev: ApiErrorShape | null,
  formData: FormData,
): Promise<ApiErrorShape> {
  const input = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    organizationName: formData.get('organizationName'),
  };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: parsed.error.flatten().fieldErrors.email?.[0] ?? 'Invalid input',
        details: parsed.error.flatten().fieldErrors,
      },
    };
  }
  const data = parsed.data;

  const slugBase =
    data.organizationName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: await hashPassword(data.password),
        },
      });

      // Unique slug: try the base first, then append a numeric suffix.
      let slug = slugBase;
      let attempt = 0;
      while (await tx.organization.findUnique({ where: { slug } })) {
        attempt += 1;
        slug = `${slugBase}-${attempt}`;
      }

      const organization = await tx.organization.create({
        data: { name: data.organizationName, slug, quotaCurrency: 'USD' },
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'owner',
          status: 'active',
          joinedAt: new Date(),
        },
      });

      return { userId: user.id, organizationId: organization.id };
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _result = result;
  } catch (err) {
    return toApiError(err);
  }

  // On success the new owner lands in the ramp wizard. The ramp page IS the
  // onboarding funnel (route-map §3.1) and gates the rest of the shell until
  // onboarded_at is set.
  redirect('/ramp');
}
