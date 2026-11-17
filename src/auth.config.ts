/* NextAuth-Grundkonfiguration ohne Datenbankzugriff – wird auch im Proxy (vor jeder Anfrage) verwendet. */
import type { NextAuthConfig } from 'next-auth';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/health'];

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  trustHost: true,
  providers: [],
  callbacks: {
    /** Nicht angemeldete Personen auf /login umleiten */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user?.id) token.employeeId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.employeeId && session.user) session.user.id = String(token.employeeId);
      return session;
    },
  },
} satisfies NextAuthConfig;
