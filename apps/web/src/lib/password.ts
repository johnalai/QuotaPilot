/**
 * Password hashing for the Credentials provider (architecture §9.1).
 *
 * Decision recorded in docs/phase-1-slice-1.md: argon2 (native) is preferred;
 * bcryptjs is the documented Windows fallback if the argon2 native build is
 * unreliable. This module is the single seam so the choice stays localized.
 *
 * Conventions:
 * - Never log plaintext or the resulting hash.
 * - Verify is constant-time in the underlying library's default path.
 */
import argon2 from 'argon2';

/** Argon2id, tuned to the library's default cost (memory 64MiB, time 3, 1 lane). */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/** Constant-time verify of a plaintext against a stored argon2id hash. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return argon2.verify(storedHash, password);
}