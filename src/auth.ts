/* NextAuth (Auth.js v5) – Anmeldung
   1. Microsoft Entra ID (Firmen-SSO), wenn AUTH_MICROSOFT_ENTRA_ID_* gesetzt ist
   2. E-Mail + Passwort (für Personen mit hinterlegtem Passwort-Hash)
   3. Demo-Anmeldung „Benutzer wählen“ – nur mit AUTH_DEMO_LOGIN=true
   Die Rolle wird nie im Token gespeichert, sondern bei jeder Anfrage frisch aus der Datenbank gelesen
   (siehe src/server/session.ts) – Rollenänderungen wirken damit sofort. */
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authConfig } from './auth.config';
import { prisma } from './server/db';

export const demoLoginEnabled = () => process.env.AUTH_DEMO_LOGIN === 'true';
export const entraEnabled = () => !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID && !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;

class InactiveUser extends CredentialsSignin {
  code = 'inactive';
}

const providers = [
  Credentials({
    id: 'password',
    name: 'E-Mail & Passwort',
    credentials: { email: { label: 'E-Mail' }, password: { label: 'Passwort', type: 'password' } },
    async authorize(raw) {
      const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
      if (!parsed.success) return null;
      const emp = await prisma.employee.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!emp?.passwordHash) return null;
      if (!emp.active) throw new InactiveUser();
      const ok = await bcrypt.compare(parsed.data.password, emp.passwordHash);
      return ok ? { id: emp.id, name: emp.name, email: emp.email } : null;
    },
  }),
  Credentials({
    id: 'demo',
    name: 'Demo-Anmeldung',
    credentials: { employeeId: { label: 'Benutzer' } },
    async authorize(raw) {
      if (!demoLoginEnabled()) return null;
      const id = typeof raw?.employeeId === 'string' ? raw.employeeId : '';
      const emp = id ? await prisma.employee.findUnique({ where: { id } }) : null;
      if (!emp || !emp.active) return null;
      return { id: emp.id, name: emp.name, email: emp.email };
    },
  }),
  ...(entraEnabled()
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    /** SSO: nur Personen, die als Mitarbeiter (gleiche E-Mail) angelegt sind */
    async signIn({ user, account }) {
      if (account?.provider !== 'microsoft-entra-id') return true;
      const email = user.email?.toLowerCase();
      const emp = email ? await prisma.employee.findUnique({ where: { email } }) : null;
      if (!emp || !emp.active) return '/login?error=unknown-account';
      user.id = emp.id;
      return true;
    },
  },
});
