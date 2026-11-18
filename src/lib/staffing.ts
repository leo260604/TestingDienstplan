/* Mindestbesetzung je Team und Wochentag (Mo–So) – zählt Teammitglieder mit Dienst (ohne Abwesenheit) */
import { teamSettings } from './access';
import { isHoliday } from './holidays';
import type { Entry, Person, Team } from './types';

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** 0 = Montag … 6 = Sonntag */
const weekdayOf = (iso: string) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7;

export const hasMinStaff = (t: Team) => teamSettings(t).minStaff.some((n) => n > 0);

/** Geforderte Mindestbesetzung an diesem Tag (0 = keine Vorgabe) */
export const minStaffOn = (t: Team, iso: string) => teamSettings(t).minStaff[weekdayOf(iso)] || 0;

/** Anzahl Teammitglieder mit Dienst an diesem Tag */
export function staffedOn(entries: Entry[], t: Team, staff: Person[], iso: string): number {
  const names = new Set(t.memberIds.map((id) => staff.find((p) => p.id === id)?.name).filter(Boolean) as string[]);
  const absent = new Set(entries.filter((a) => a.date === iso && a.isAbsence && !a.start && names.has(a.employee)).map((a) => a.employee));
  return new Set(entries.filter((a) => a.date === iso && a.kind === 'Dienstplan' && !a.isAbsence && names.has(a.employee) && !absent.has(a.employee)).map((a) => a.employee)).size;
}

export interface Understaffed {
  team: Team;
  date: string;
  have: number;
  need: number;
}

/** Tage, an denen ein Team unter seiner Mindestbesetzung liegt */
export function understaffed(entries: Entry[], teams: Team[], staff: Person[], dates: string[]): Understaffed[] {
  const out: Understaffed[] = [];
  for (const t of teams) {
    if (!hasMinStaff(t)) continue;
    for (const date of dates) {
      if (isHoliday(date)) continue; // an Feiertagen sind keine Dienste möglich
      const need = minStaffOn(t, date);
      if (!need) continue;
      const have = staffedOn(entries, t, staff, date);
      if (have < need) out.push({ team: t, date, have, need });
    }
  }
  return out;
}
