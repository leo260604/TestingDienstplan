/* Demo-Daten in die Datenbank schreiben.
   npx prisma db seed                      → Stammdaten (Teams, Personen, Dienstzeiten, Bereitschaftszeiten)
   SEED_DEMO_ENTRIES=true npx prisma db seed → zusätzlich 5 Wochen Dienste & Bereitschaften
   Achtung: löscht vorher alle vorhandenen Daten! */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { buildDemoData } from '../src/lib/demo-data';
import { DEFAULT_PERMS, SYSTEM_ROLES } from '../src/lib/permissions';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  // SEED_ONLY_IF_EMPTY=true: nur eine leere Datenbank befüllen (z. B. bei jedem Deploy sicher aufrufbar)
  if (process.env.SEED_ONLY_IF_EMPTY === 'true' && (await prisma.employee.count()) > 0) {
    console.log('Seed übersprungen – Datenbank enthält bereits Daten.');
    return;
  }
  const demo = buildDemoData({ withEntries: process.env.SEED_DEMO_ENTRIES === 'true' });
  console.log(`Seed: ${demo.teams.length} Teams, ${demo.staff.length} Personen, ${demo.entries.length} Einträge`);

  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.swapRequest.deleteMany(),
    prisma.teamNote.deleteMany(),
    prisma.entry.deleteMany(),
    prisma.standbyTimeTeam.deleteMany(),
    prisma.standbyTime.deleteMany(),
    prisma.standbyGroup.deleteMany(),
    prisma.shiftType.deleteMany(),
    prisma.teamMember.deleteMany(),
    prisma.team.deleteMany(),
    prisma.department.deleteMany(),
    prisma.userPreference.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.role.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.exportLog.deleteMany(),
    prisma.appSetting.deleteMany(),
  ]);

  await prisma.role.createMany({
    data: SYSTEM_ROLES.map((name, i) => ({ name, permissions: DEFAULT_PERMS[name] ?? {}, isSystem: true, sortOrder: i })),
  });
  await prisma.employee.createMany({
    data: demo.staff.map((p) => ({ id: p.id, name: p.name, email: p.email || null, phone: p.phone || null, teamsPhone: p.teamsPhone || null, roleName: p.role })),
  });
  for (const [i, t] of demo.teams.entries()) {
    await prisma.team.create({
      data: {
        id: t.id,
        name: t.name,
        standbyColor: t.standbyColor,
        settings: t.settings,
        leaderId: t.leaderId || null,
        deputyId: t.deputyId || null,
        sortOrder: i,
        members: { create: t.memberIds.map((employeeId, k) => ({ employeeId, sortOrder: k })) },
      },
    });
  }
  await prisma.shiftType.createMany({
    data: demo.shiftTypes.map((s) => ({ id: s.id, teamId: s.teamId, name: s.name, start: s.start, end: s.end, pauseMin: s.pause, multi: s.multi, color: s.color })),
  });
  await prisma.standbyGroup.createMany({ data: demo.standbyGroups });
  await prisma.standbyTime.createMany({
    data: demo.standbyTimes.map((t) => ({ id: t.id, name: t.name, type: t.type === 'variabel' ? 'VARIABEL' : 'FIX', start: t.start, end: t.end, color: t.color, groupId: t.groupId })),
  });
  const teamId = new Map(demo.teams.map((t) => [t.name, t.id]));
  const empId = new Map(demo.staff.map((p) => [p.name, p.id]));
  if (demo.entries.length) {
    await prisma.entry.createMany({
      data: demo.entries.map((e) => ({
        kind: e.kind === 'Bereitschaft' ? 'BEREITSCHAFT' : e.kind === 'Arbeitsort' ? 'ARBEITSORT' : e.kind === 'Notiz' ? 'NOTIZ' : 'DIENSTPLAN',
        isAbsence: !!e.isAbsence,
        date: new Date(e.date + 'T00:00:00Z'),
        employeeId: empId.get(e.employee)!,
        teamId: teamId.get(e.team) ?? null,
        shift: e.shift,
        start: e.start || null,
        end: e.end || null,
        color: e.color || null,
        note: e.note || null,
        groupId: e.groupId || null,
        groupName: e.groupName || null,
      })),
    });
  }
  await prisma.appSetting.createMany({
    data: [
      { key: 'features', value: {} },
      { key: 'cockpitLink', value: {} },
    ],
  });
  await prisma.auditLog.create({
    data: { userName: 'System', role: 'Admin', action: 'Erstellt', area: 'Administration', title: 'Demo-Daten angelegt', detail: `${demo.teams.length} Teams, ${demo.staff.length} Personen` },
  });
  console.log('Seed abgeschlossen.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
