'use server';
import { AuthError } from 'next-auth';
import { signIn, signOut, demoLoginEnabled } from '@/auth';
import { safeCallbackPath } from '@/lib/url';

export async function loginDemo(employeeId: string, callbackUrl?: string): Promise<string | undefined> {
  if (!demoLoginEnabled()) return 'Die Demo-Anmeldung ist deaktiviert.';
  try {
    await signIn('demo', { employeeId, redirectTo: safeCallbackPath(callbackUrl) });
  } catch (e) {
    if (e instanceof AuthError) return 'Bitte Benutzer auswählen.';
    throw e; // Weiterleitung
  }
}

export async function loginPassword(email: string, password: string, callbackUrl?: string): Promise<string | undefined> {
  try {
    await signIn('password', { email, password, redirectTo: safeCallbackPath(callbackUrl) });
  } catch (e) {
    if (e instanceof AuthError) return 'E-Mail oder Passwort ist falsch.';
    throw e;
  }
}

export async function loginMicrosoft(callbackUrl?: string) {
  await signIn('microsoft-entra-id', { redirectTo: safeCallbackPath(callbackUrl) });
}

export async function logout() {
  await signOut({ redirectTo: '/login' });
}
