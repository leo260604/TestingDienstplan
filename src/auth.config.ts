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
      const { pathname, search } = request.nextUrl;
      if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
      if (auth?.user) return true;
      // Selbst umleiten: hinter dem Proxy kennt der Server nur seine interne Adresse (localhost:3001) –
      // daher die echte Adresse aus den Weiterleitungs-Headern und als Rücksprung nur den Pfad.
      const h = request.headers;
      const host = (h.get('x-forwarded-host') || h.get('host') || request.nextUrl.host).split(',')[0].trim();
      const proto = (h.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')).split(',')[0].trim();
      const to = new URL('/login', `${proto}://${host}`);
      if (pathname !== '/' && pathname !== '/dashboard') to.searchParams.set('callbackUrl', pathname + search);
      return Response.redirect(to);
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
