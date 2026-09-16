/**
 * Liveness probe (implementation-plan Phase 0 DoD). No auth, no DB.
 */
export function GET() {
  return Response.json({ ok: true, status: 'ok' });
}
