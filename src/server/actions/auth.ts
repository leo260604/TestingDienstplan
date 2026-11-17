'use server';
import { AuthError } from 'next-auth';
import { signIn, signOut, demoLoginEnabled } from '@/auth';

export async function loginDemo(employeeId: string): Promise<string | undefined> {
  if (!demoLoginEnabled()) return 'Die Demo-Anmeldung ist deaktiviert.';
  try {
    await signIn('demo', { employeeId, redirectTo: '/dashboard' });
  } catch (e) {
    if (e instanceof AuthError) return 'Bitte Benutzer auswählen.';
    throw e; // Weiterleitung
  }
}

export async function loginPassword(email: string, password: string): Promise<string | undefined> {
  try {
    await signIn('password', { email, password, redirectTo: '/dashboard' });
  } catch (e) {
    if (e instanceof AuthError) return 'E-Mail oder Passwort ist falsch.';
    throw e;
  }
}

export async function loginMicrosoft() {
  await signIn('microsoft-entra-id', { redirectTo: '/dashboard' });
}

export async function logout() {
  await signOut({ redirectTo: '/login' });
}
