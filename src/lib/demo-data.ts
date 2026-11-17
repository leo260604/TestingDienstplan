/* Demo-Datenbasis (entspricht „teams10-v3“ + „Team Donau“ der Browser-Version).
   Wird vom Seed-Skript und von Tests verwendet. */
import { addDays, isoDate, weekStart } from './dates';
import type { Entry, Person, ShiftType, StandbyGroup, StandbyTime, Team } from './types';

export const initials = (n: string) =>
  String(n || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??';

const mailOf = (n: string) =>
  n.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, '.') + '@example.at';

export const TEAM_COLORS = ['#3974c6', '#24966b', '#e09a2d', '#9b69c8', '#dc6475', '#159da8', '#596579', '#d95f20', '#7b8f32', '#263d75'];

export interface DemoData {
  staff: Person[];
  teams: Team[];
  shiftTypes: ShiftType[];
  standbyGroups: StandbyGroup[];
  standbyTimes: StandbyTime[];
  entries: Entry[];
}

export function buildDemoData({ withEntries = false, today = new Date() } = {}): DemoData {
  const firstNames = ['Alex', 'Sarah', 'Daniel', 'Julia', 'Michael', 'Laura', 'Stefan', 'Nina', 'Markus', 'Sophie', 'David', 'Lisa', 'Patrick', 'Anna', 'Florian', 'Eva', 'Thomas', 'Miriam', 'Martin', 'Lea', 'Andreas', 'Katharina', 'Simon', 'Johanna', 'Christian', 'Theresa', 'Fabian', 'Melanie', 'Tobias', 'Elena', 'Dominik', 'Clara', 'Manuel', 'Lena', 'Philipp', 'Marie', 'Jakob', 'Hannah', 'Sebastian', 'Amelie', 'Benjamin', 'Valentina', 'Raphael', 'Paula', 'Matthias', 'Isabella', 'Felix', 'Emilia', 'Jonas', 'Victoria'];
  const lastNames = ['Gruber', 'Huber', 'Bauer', 'Wagner', 'Müller', 'Pichler', 'Steiner', 'Moser', 'Mayer', 'Hofer', 'Leitner', 'Berger', 'Fuchs', 'Eder', 'Winkler', 'Schmid', 'Reiter', 'Auer', 'Fischer', 'Schwarz', 'Wolf', 'Lang', 'Brunner', 'Baumgartner', 'Haas', 'Binder', 'Lechner', 'Wallner', 'Holzer', 'Weber', 'Koller', 'Aigner', 'Wimmer', 'Egger', 'Graf', 'Kern', 'Lindner', 'Platzer', 'Strasser', 'Riegler', 'Maier', 'Ebner', 'Hofmann', 'Zach', 'Kogler', 'Hauser', 'Sommer', 'Nagl', 'Frank', 'Kaiser'];
  const labels = ['Nord', 'Süd', 'Ost', 'West', 'Zentrum', 'Nordost', 'Nordwest', 'Südost', 'Südwest', 'Innenstadt'];
  const staff: Person[] = [];
  const teams: Team[] = [];
  const shiftTypes: ShiftType[] = [];

  const makePerson = (idx: number, role: string) => {
    const fn = firstNames[idx % firstNames.length],
      ln = lastNames[(idx * 7) % lastNames.length];
    const name = fn + ' ' + ln;
    const id = 'demo-emp-' + String(idx + 1).padStart(3, '0');
    staff.push({
      id,
      name,
      initials: initials(name),
      email: `${fn.toLowerCase()}.${ln.toLowerCase().replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ä/g, 'ae')}@example.at`,
      phone: `+43 660 ${String(1000000 + idx * 137).slice(-7)}`,
      teamsPhone: '',
      photo: '',
      role,
    });
    return id;
  };

  for (let i = 0; i < 10; i++) {
    const ids = Array.from({ length: 5 }, (_, j) => makePerson(i * 5 + j, j === 0 ? (i === 0 ? 'Admin' : 'Teamleiter') : j === 1 ? 'Deputy' : 'Mitarbeiter'));
    const id = 'demo-team-' + String(i + 1).padStart(2, '0');
    const name = 'Team ' + labels[i];
    teams.push({ id, name, memberIds: ids, leaderId: ids[0], deputyId: i === 6 ? '' : ids[1], standbyColor: TEAM_COLORS[i], settings: {} });
    shiftTypes.push({ id: `st-${id}-tag`, team: name, teamId: id, name: 'Tagdienst', start: '07:00', end: '15:00', pause: 30, multi: true, color: TEAM_COLORS[i] });
    shiftTypes.push({ id: `st-${id}-frueh`, team: name, teamId: id, name: 'Frühdienst', start: '06:00', end: '14:00', pause: 30, multi: true, color: '#159da8' });
    shiftTypes.push({ id: `st-${id}-spaet`, team: name, teamId: id, name: 'Spätdienst', start: '14:00', end: '22:00', pause: 30, multi: true, color: '#263d75' });
  }

  // Team Donau (Ergänzung 11/2026)
  const donau: [string, string][] = [
    ['Bernhard Pfeiffer', 'Teamleiter'],
    ['Sandra Kofler', 'Deputy'],
    ['Lukas Gartner', 'Mitarbeiter'],
    ['Verena Zauner', 'Mitarbeiter'],
    ['Moritz Reisinger', 'Mitarbeiter'],
    ['Carina Pölzl', 'Mitarbeiter'],
    ['Niklas Hackl', 'Mitarbeiter'],
    ['Sabine Kraus', 'Mitarbeiter'],
    ['Elias Danninger', 'Mitarbeiter'],
    ['Jana Fellner', 'Mitarbeiter'],
  ];
  const donauIds = donau.map(([name, role], i) => {
    const id = 'donau-emp-' + String(i + 1).padStart(2, '0');
    staff.push({ id, name, initials: initials(name), email: mailOf(name), phone: `+43 660 ${2000100 + i * 113}`, teamsPhone: '', photo: '', role });
    return id;
  });
  const donauColor = '#b5487d';
  teams.push({ id: 'team-donau', name: 'Team Donau', memberIds: donauIds, leaderId: donauIds[0], deputyId: donauIds[1], standbyColor: donauColor, settings: {} });
  (
    [
      ['Tagdienst', '07:00', '15:00', donauColor],
      ['Frühdienst', '06:00', '14:00', '#159da8'],
      ['Spätdienst', '14:00', '22:00', '#263d75'],
    ] as const
  ).forEach(([name, start, end, color], k) =>
    shiftTypes.push({ id: `st-team-donau-${k}`, team: 'Team Donau', teamId: 'team-donau', name, start, end, pause: 30, multi: true, color }),
  );

  const standbyGroups: StandbyGroup[] = [{ id: 'demo-standby-group', name: 'Team-Bereitschaft' }];
  const standbyTimes: StandbyTime[] = [
    { id: 'demo-standby-day', groupId: 'demo-standby-group', name: 'Tagesbereitschaft', type: 'fix', start: '07:00', end: '19:00', color: '#159da8' },
    { id: 'demo-standby-night', groupId: 'demo-standby-group', name: 'Nachtbereitschaft', type: 'fix', start: '19:00', end: '07:00', color: '#263d75' },
  ];

  const entries: Entry[] = [];
  if (withEntries) {
    const base = weekStart(today);
    let aid = 1;
    for (let d = 0; d < 35; d++) {
      const date = addDays(base, d),
        dow = (date.getDay() + 6) % 7,
        dateStr = isoDate(date);
      for (let i = 0; i < 10; i++) {
        const team = teams[i],
          members = team.memberIds.map((id) => staff.find((x) => x.id === id)!);
        if (dow < 5) {
          for (let j = 0; j < 5; j++) {
            const person = members[j];
            if ((d + j + i) % 17 === 0) {
              entries.push({ id: 'demo-a-' + aid++, kind: 'Dienstplan', team: team.name, employee: person.name, shift: 'Urlaub', start: '', end: '', date: dateStr, isAbsence: true, note: '', color: '#d69b38' });
              continue;
            }
            const late = (j + d) % 4 === 3;
            entries.push({ id: 'demo-a-' + aid++, kind: 'Dienstplan', team: team.name, employee: person.name, shift: late ? 'Spätdienst' : 'Tagdienst', start: late ? '14:00' : '07:00', end: late ? '22:00' : '15:00', color: late ? '#263d75' : TEAM_COLORS[i], date: dateStr });
          }
        } else if (dow === 5) {
          const person = members[d % 5];
          entries.push({ id: 'demo-a-' + aid++, kind: 'Dienstplan', team: team.name, employee: person.name, shift: 'Frühdienst', start: '06:00', end: '14:00', color: '#159da8', date: dateStr });
        }
        if (!(i === 1 && d === 16) && !(i === 6 && d === 23)) {
          const sb = members[Math.floor(d / 7) % 5];
          entries.push({ id: 'demo-a-' + aid++, kind: 'Bereitschaft', team: team.name, employee: sb.name, shift: 'Tagesbereitschaft', groupId: standbyGroups[0].id, groupName: standbyGroups[0].name, start: '07:00', end: '19:00', color: TEAM_COLORS[i], date: dateStr });
        }
      }
    }
  }
  return { staff, teams, shiftTypes, standbyGroups, standbyTimes, entries };
}
