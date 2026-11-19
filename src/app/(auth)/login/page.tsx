import { redirect } from 'next/navigation';
import { demoLoginEnabled, entraEnabled } from '@/auth';
import { getCurrentUser } from '@/server/session';
import { prisma } from '@/server/db';
import { isoDate } from '@/lib/dates';
import { isoToDate } from '@/server/mappers';
import { LoginScreen } from './LoginScreen';
import { safeCallbackPath } from '@/lib/url';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const { error, callbackUrl } = await searchParams;
  const next = safeCallbackPath(callbackUrl);
  if (await getCurrentUser()) redirect(next);
  const demo = demoLoginEnabled();
  const [teams, staffCount, users, today] = await Promise.all([
    prisma.team.findMany({ include: { members: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.employee.count({ where: { active: true } }),
    demo ? prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, roleName: true, photo: true } }) : [],
    prisma.entry.findMany({ where: { date: isoToDate(isoDate(new Date())), isAbsence: false, kind: { in: ['DIENSTPLAN', 'BEREITSCHAFT'] } }, include: { team: true, employee: true }, take: 200 }),
  ]);
  const duty = today.find((e) => e.kind === 'DIENSTPLAN');
  const standby = today.find((e) => e.kind === 'BEREITSCHAFT');
  return (
    <LoginScreen
      demo={demo}
      next={next}
      sso={entraEnabled()}
      error={error === 'unknown-account' ? 'Dieses Microsoft-Konto ist keinem Mitarbeiter zugeordnet.' : error ? 'Die Anmeldung ist fehlgeschlagen.' : ''}
      stats={`${teams.length} Teams · ${staffCount} Mitarbeiter · alle Schichten auf einen Blick.`}
      heroDuty={duty ? { title: `${duty.shift} · ${duty.start}–${duty.end}`, sub: `${duty.team?.name || ''} · ${today.filter((e) => e.kind === 'DIENSTPLAN' && e.teamId === duty.teamId).length} Mitarbeiter` } : null}
      heroStandby={standby ? { title: `Bereitschaft · ${standby.start || 'variabel'}${standby.end ? '–' + standby.end : ''}`, sub: `${standby.employee.name} · ${standby.team?.name || ''}` } : null}
      users={users.map((u) => {
        const t = teams.find((x) => x.members.some((m) => m.employeeId === u.id));
        return { id: u.id, name: u.name, email: u.email || '', role: u.roleName, photo: u.photo || '', team: t?.name || 'Ohne Team', color: t?.standbyColor || '#14A1A9' };
      })}
    />
  );
}
