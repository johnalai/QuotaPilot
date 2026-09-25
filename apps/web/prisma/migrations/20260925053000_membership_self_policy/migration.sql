-- QuotaPilot · membership_self: the identity claim for sign-in.
--
-- `membership` carries the membership_isolation policy, keyed on the org claim in
-- `request.jwt.claims`. Sign-in has to *discover* the caller's org, so there is
-- no org claim to set yet — and with no claim the RLS-subject app role read zero
-- rows from `membership`. authorize() therefore attached no organizationId, the
-- session callback's gate then attached nothing at all (not even `id`), and the
-- route-layer guard rejected every session. Result: login issued a valid cookie
-- that the app treated as unauthenticated, making every authenticated page
-- unreachable.
--
-- This adds a second, deliberately narrower claim for that one bootstrap step:
-- rows are visible when `user_id` matches `app.user_id`, which server code sets
-- inside the same transaction and only AFTER the password has been verified
-- (see apps/web/src/lib/db/tenancy/tenant-ctx.ts → withUserClaim).
--
-- SELECT only: this grants no write path, and it never widens what the org claim
-- can see. A user can read their own memberships and nothing else.

CREATE POLICY membership_self ON membership FOR SELECT TO quotapilot_app
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));
