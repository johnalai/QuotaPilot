/**
 * NextAuth.js type augmentation for extended user fields.
 *
 * The `authorize()` callback returns a user object with organizationId and role,
 * which are then attached to the JWT token and session. This declaration
 * extends the core User type so TypeScript knows about these fields.
 */
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    organizationId?: string | null;
    role?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      organizationId?: string;
      role?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    organizationId?: string;
    role?: string;
  }
}