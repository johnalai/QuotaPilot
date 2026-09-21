import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

/** Synthetic value only — never a real credential; never logged. */
const FIXTURE = 'synthetic-test-password-7cd';

describe('password hashing (documented decision → docs/phase-1-slice-1.md)', () => {
  it('produces an argon2id PHC-format hash', async () => {
    const hash = await hashPassword(FIXTURE);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword(FIXTURE);
    await expect(verifyPassword(FIXTURE, hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword(FIXTURE);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('uses a fresh salt per hash', async () => {
    const [a, b] = await Promise.all([hashPassword(FIXTURE), hashPassword(FIXTURE)]);
    expect(a).not.toBe(b);
  });
});