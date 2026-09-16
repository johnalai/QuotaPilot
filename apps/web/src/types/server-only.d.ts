/**
 * Ambient declaration for Next's internal `server-only` module.
 *
 * Next resolves this specifier at build time (create-compiler-aliases.js) and
 * fails the build if it is pulled into a Client Component bundle, so the npm
 * package is not required at runtime. This declaration exists only so
 * `tsc --noEmit` can resolve the `import 'server-only'` in server modules
 * (lib/db, lib/auth, feature services/actions).
 */
declare module 'server-only';
