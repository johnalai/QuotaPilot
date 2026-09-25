import 'server-only';

import { z } from 'zod';

import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/password';
import { validationError } from '@/lib/errors';

/**
 * Registration contract (route-map §2.2).
 *
 * The first user of an org becomes its owner. Everything lands in one
 * transaction so a partial write can never leave an org without an owner.
 */
export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    email: z.string().trim().toLowerCase().email('A valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    organizationName: z.string().trim().min(1, 'Organization name is required').max(120),
  })
  .superRefine((input, ctx) => {
    // Password strength floor: at least one digit and one letter, so a
    // dictionary word can't sail through. Cheap, deterministic, no third party.
    if (!/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password must contain at least one letter and one number',
      });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export interface RegisterResult {
  ok: true;
  userId: string;
  organizationId: string;
}

/**
 * Create a user + org + owner membership in one transaction.
 *
 * The slug is derived from the org name and made unique with a numeric suffix
 * on collision; the org currency defaults to USD (single-currency MVP, §0).
 */
export async function register(input: RegisterInput): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError('Invalid registration input', parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const slugBase =
    data.organizationName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';

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

  return { ok: true, ...result };
}
