import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from './db';
import type { CurrentUser } from '@/lib/types';

/** Angemeldete Person – Rolle immer frisch aus der Datenbank */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const emp = await prisma.employee.findUnique({ where: { id }, select: { id: true, name: true, roleName: true, active: true } });
  if (!emp || !emp.active) return null;
  return { id: emp.id, name: emp.name, role: emp.roleName };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
