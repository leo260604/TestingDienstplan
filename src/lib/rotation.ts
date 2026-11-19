/* Automatische Rotation für Bereitschaft und Dienstplan – reine Funktionen, aus der
   Browser-Version übernommen. Sie liefern die neuen Einträge, ohne etwas zu speichern. */
import { addDays, day, isoDate, timeSpan, weekStart } from './dates';
import { isHoliday } from './holidays';
import { fullDayAbsent, shiftHexColor, shiftMulti, standbyDayOk } from './entries';
import type { Entry, ShiftType, StandbyGroup, StandbyTime } from './types';

export const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

/* ===================== Bereitschaft ===================== */

export interface StandbyRotationInput {
  entries: Entry[];
  teams: { name: string; standbyColor?: string; members: string[] }[];
  time: StandbyTime;
  group?: StandbyGroup;
  from: string;
  to: string;
  mode: 'week' | 'day';
  keep: boolean;
  /** bei variabler Bereitschaft */
  start?: string;
  end?: string;
}

/** Verteilt die Bereitschaft der Reihe nach; setzt dort fort, wo die letzte Bereitschaft vor dem Zeitraum endete. */
export function planStandbyRotation(inp: StandbyRotationInput): { entries: Entry[]; created: Entry[]; removed: string[] } {
  let entries = inp.entries.slice();
  const removed: string[] = [];
  const created: Entry[] = [];
  const dates: string[] = [];
  for (let c = day(inp.from); isoDate(c) <= inp.to && dates.length <= 366; c = addDays(c, 1)) if (standbyDayOk(inp.time, isoDate(c))) dates.push(isoDate(c));
  const start = inp.start ?? inp.time.start;
  const end = inp.end ?? inp.time.end;
  inp.teams.forEach((t) => {
    const members = t.members;
    if (!members.length) return;
    if (!inp.keep) {
      entries = entries.filter((a) => {
        const hit = a.kind === 'Bereitschaft' && a.team === t.name && a.date >= inp.from && a.date <= inp.to;
        if (hit) removed.push(a.id);
        return !hit;
      });
    }
    const prev = entries
      .filter((a) => a.kind === 'Bereitschaft' && a.team === t.name && a.date < inp.from)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    let idx = prev && members.includes(prev.employee) ? members.indexOf(prev.employee) + 1 : 0;
    let lastKey: string | null = null;
    dates.forEach((date) => {
      const key = inp.mode === 'week' ? isoDate(weekStart(day(date))) : date;
      if (lastKey !== null && key !== lastKey) idx++;
      lastKey = key;
      if (entries.some((a) => a.kind === 'Bereitschaft' && a.team === t.name && a.date === date)) return;
      let who: string | null = null;
      for (let k = 0; k < members.length; k++) {
        const cand = members[(idx + k) % members.length];
        if (!fullDayAbsent(entries, cand, date) && !entries.some((a) => a.kind === 'Bereitschaft' && a.employee === cand && a.date === date)) {
          who = cand;
          break;
        }
      }
      if (!who) return;
      const item: Entry = {
        id: makeId(),
        kind: 'Bereitschaft',
        team: t.name,
        employee: who,
        shift: inp.time.name,
        groupId: inp.group?.id || '',
        groupName: inp.group?.name || '',
        start: start || '',
        end: end || '',
        color: t.standbyColor || '#159da8',
        date,
      };
      entries.push(item);
      created.push(item);
    });
  });
  return { entries, created, removed };
}

/* ===================== Dienstplan ===================== */

export const ROTATION_ABSENCES = ['Urlaub', 'Gleittag', 'Sonderurlaub', 'Berufsschule', 'Abwesend'];
/** Montag – fester Bezugspunkt für die Reihenfolge */
const ANCHOR = Date.UTC(2024, 0, 1);

export interface DutyRotationInput {
  entries: Entry[];
  /** favorites: Wunschdienste je Person (Name → Dienstnamen) – werden bevorzugt zugeteilt */
  teams: { name: string; members: string[]; shifts: ShiftType[]; favorites?: Record<string, string[]> }[];
  from: string;
  to: string;
  mode: 'week' | 'day';
  keep: boolean;
  /** Dienst-Rotation: immer Montag bis Freitag */
  workDays?: number;
}

export interface DutyRotationResult {
  entries: Entry[];
  created: Entry[];
  removed: string[];
  stats: { absent: number; moved: number; unfilled: number; dayFree: number; shortRest: number; noShift: string[]; wished: number; wishedOf: number };
}

/** Faires Muster: Zyklus so lang wie das Team; Einzeldienste genau einmal im Zyklus,
    mehrfach besetzbare Dienste füllen die übrigen Plätze gleichmäßig verteilt. */
export function rotationPattern(shifts: Pick<ShiftType, 'multi'>[], memberCount: number): number[] {
  const n = shifts.length,
    L = Math.max(memberCount, n);
  const multi = shifts.map((_, j) => j).filter((j) => shiftMulti(shifts[j]));
  const tgt = new Array(n).fill(1);
  let rest = L - n;
  const pool = multi.length ? multi : shifts.map((_, j) => j);
  for (let r = 0; rest > 0; r++, rest--) tgt[pool[r % pool.length]]++;
  const used = new Array(n).fill(0),
    out: number[] = [];
  for (let j = 0; j < L; j++) {
    let best = -1,
      bv = -Infinity;
    for (let k = 0; k < n; k++) {
      if (used[k] >= tgt[k]) continue;
      const v = (tgt[k] * (j + 1)) / L - used[k];
      if (v > bv + 1e-9) {
        bv = v;
        best = k;
      }
    }
    used[best]++;
    out.push(best);
  }
  return out;
}

export function planDutyRotation(inp: DutyRotationInput): DutyRotationResult {
  const ROT_DAYS = inp.workDays ?? 5;
  const teamNames = inp.teams.map((t) => t.name);
  const inRange = (a: Entry) => a.kind === 'Dienstplan' && !a.isAbsence && a.date >= inp.from && a.date <= inp.to && teamNames.includes(a.team);
  const removed = inp.keep ? [] : inp.entries.filter(inRange).map((a) => a.id);
  const entries = inp.keep ? inp.entries.slice() : inp.entries.filter((a) => !inRange(a));
  const created: Entry[] = [];
  const stats = { absent: 0, moved: 0, unfilled: 0, dayFree: 0, shortRest: 0, noShift: [] as string[], wished: 0, wishedOf: 0 };

  const dates: string[] = [];
  for (let c = day(inp.from); isoDate(c) <= inp.to; c = addDays(c, 1)) {
    if (dates.length > 366) break;
    if ((c.getDay() + 6) % 7 < ROT_DAYS && !isHoliday(isoDate(c))) dates.push(isoDate(c));
  }
  const rotationAbsent = (name: string, date: string) =>
    fullDayAbsent(entries, name, date) || entries.some((a) => a.isAbsence && a.employee === name && a.date === date && ROTATION_ABSENCES.includes(a.shift));
  const period = (date: string) => {
    const t = day(date);
    const base = inp.mode === 'week' ? weekStart(t) : t;
    return Math.floor((Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()) - ANCHOR) / (inp.mode === 'week' ? 604800000 : 86400000));
  };
  const duty = (name: string, date: string) => entries.filter((a) => a.employee === name && a.date === date && a.kind === 'Dienstplan' && !a.isAbsence && a.start && a.end);
  const dayOff = (date: string, o: number) => isoDate(addDays(day(date), o));

  inp.teams.forEach((t) => {
    const shifts = t.shifts;
    if (!shifts.length) {
      stats.noShift.push(t.name);
      return;
    }
    const members = t.members;
    const pattern = rotationPattern(shifts, members.length);
    /* Wunschdienste: Index der gewünschten Dienste je Person (nur Dienste, die in dieser Rotation vorkommen) */
    const favIdx = new Map<string, number[]>();
    members.forEach((name) => {
      const ks = (t.favorites?.[name] || []).map((s) => shifts.findIndex((sh) => sh.name === s)).filter((k) => k >= 0);
      if (ks.length) favIdx.set(name, ks);
    });
    type P = { name: string; pref: number; away: boolean };
    const likes = (x: P, k: number) => !!favIdx.get(x.name)?.includes(k);
    const hasFav = (x: P) => favIdx.has(x.name);
    dates.forEach((date) => {
      const p = period(date),
        n = shifts.length,
        cap = (k: number) => (shiftMulti(shifts[k]) ? Infinity : 1);
      const fits = (name: string, sh: ShiftType) => {
        const [ns, ne] = timeSpan(sh);
        return !(
          duty(name, dayOff(date, -1)).some((a) => timeSpan(a)[1] - 1440 > ns) ||
          (ne > 1440 && duty(name, dayOff(date, 1)).some((a) => timeSpan(a)[0] < ne - 1440))
        );
      };
      const fixed = new Array(n).fill(0),
        people: P[] = [];
      let dayAbsent = 0;
      members.forEach((name, i) => {
        const ex = duty(name, date);
        if (ex.length) {
          const k = shifts.findIndex((sh) => ex.some((a) => a.team === t.name && a.shift === sh.name));
          if (k >= 0) fixed[k]++;
          return;
        }
        const away = rotationAbsent(name, date);
        if (away) {
          stats.absent++;
          dayAbsent++;
        }
        // Mit Wunschdiensten: einer davon (bei mehreren im Wechsel), sonst das faire Rotationsmuster
        const fav = favIdx.get(name);
        const pref = fav ? fav[((p % fav.length) + fav.length) % fav.length] : pattern[(((i + p) % pattern.length) + pattern.length) % pattern.length];
        people.push({ name, pref, away });
      });
      /* 1. jeder Dienst mindestens einmal, 2. Rotationsdienst bzw. mehrfach besetzbare Alternative,
         3. mehrfach besetzbare Dienste möglichst gleich stark besetzen */
      const planDay = (list: P[]) => {
        const counts = [...fixed],
          asg = new Map<P, number>();
        const off = list.length ? ((p % list.length) + list.length) % list.length : 0;
        const rot = [...list.slice(off), ...list.slice(0, off)];
        let unf = 0,
          free = 0;
        for (let k = 0; k < n; k++) {
          if (counts[k] > 0) continue;
          const open = rot.filter((x) => !asg.has(x) && fits(x.name, shifts[k]));
          /* Reihenfolge: wer den Dienst wünscht → wer laut Rotation dran ist → andere ohne Wünsche
             (zuerst die, deren Rotationsdienst ohnehin mehrfach vergeben ist) → zuletzt wer sich etwas anderes wünscht */
          const rank = (x: P) => (likes(x, k) ? (x.pref === k ? 0 : 1) : hasFav(x) ? 4 : x.pref === k ? 2 : 3);
          const spare = (x: P) => rot.filter((y) => !asg.has(y) && y.pref === x.pref).length;
          let c = open.slice().sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? spare(b) - spare(a) : 0))[0];
          // Wünschen mehrere denselben Dienst, wechseln sie sich fair ab (Woche für Woche bzw. Tag für Tag)
          if (c && rank(c) <= 1) {
            let same = open.filter((x) => rank(x) === rank(c!)).sort((a, b) => members.indexOf(a.name) - members.indexOf(b.name));
            // wer weniger Alternativen hat, kommt zuerst zum Zug (wer auch andere Dienste mag, bekommt dann einen davon)
            const fewest = Math.min(...same.map((x) => favIdx.get(x.name)?.length ?? 99));
            same = same.filter((x) => (favIdx.get(x.name)?.length ?? 99) === fewest);
            c = same[((p % same.length) + same.length) % same.length];
          }
          if (!c) {
            unf++;
            continue;
          }
          asg.set(c, k);
          counts[k]++;
        }
        rot.forEach((x) => {
          if (asg.has(x)) return;
          let k = x.pref;
          if (!(counts[k] < cap(k) && fits(x.name, shifts[k]))) {
            const alt = shifts
              .map((_, j) => j)
              .filter((j) => cap(j) === Infinity && fits(x.name, shifts[j]))
              .sort((a, b) => Number(likes(x, b)) - Number(likes(x, a)) || counts[a] - counts[b])[0];
            if (alt === undefined) {
              free++;
              return;
            }
            k = alt;
          }
          asg.set(x, k);
          counts[k]++;
        });
        const multi = shifts.map((_, j) => j).filter((j) => cap(j) === Infinity);
        for (let guard = 0; multi.length > 1 && guard < list.length * n; guard++) {
          let hi = multi[0],
            lo = multi[0];
          multi.forEach((j) => {
            if (counts[j] > counts[hi]) hi = j;
            if (counts[j] < counts[lo]) lo = j;
          });
          if (counts[hi] - counts[lo] <= 1) break;
          // Wer seinen Wunschdienst hat, wird beim Ausgleichen nicht verschoben
          const cands = rot.filter((x) => asg.get(x) === hi && fits(x.name, shifts[lo]) && (!likes(x, hi) || likes(x, lo)));
          if (!cands.length) break;
          const c = cands[((p % cands.length) + cands.length) % cands.length];
          asg.set(c, lo);
          counts[hi]--;
          counts[lo]++;
        }
        return { asg, unf, free };
      };
      const present = people.filter((x) => !x.away),
        result = planDay(present);
      stats.unfilled += result.unf;
      stats.dayFree += result.free;
      if (dayAbsent) {
        const base = planDay(people).asg;
        present.forEach((x) => {
          if (result.asg.has(x) && base.get(x) !== result.asg.get(x)) stats.moved++;
        });
      }
      const plan = present.filter((x) => result.asg.has(x)).map((x) => ({ name: x.name, k: result.asg.get(x)! }));
      // Wöchentlich: weniger als 11 Std. Ruhezeit → mit passender Person tauschen
      if (inp.mode === 'week' && n > 1) {
        const restShort = (name: string, sh: ShiftType) => {
          const ns = timeSpan(sh)[0];
          return duty(name, dayOff(date, -1)).some((a) => 1440 + ns - timeSpan(a)[1] < 660);
        };
        plan.forEach((x) => {
          if (!restShort(x.name, shifts[x.k])) return;
          const y = plan.find(
            (y) =>
              y !== x &&
              y.k !== x.k &&
              !restShort(x.name, shifts[y.k]) &&
              !restShort(y.name, shifts[x.k]) &&
              fits(x.name, shifts[y.k]) &&
              fits(y.name, shifts[x.k]),
          );
          if (y) {
            const tmp = x.k;
            x.k = y.k;
            y.k = tmp;
          }
        });
      }
      plan.forEach(({ name, k }) => {
        if (favIdx.has(name)) {
          stats.wishedOf++;
          if (favIdx.get(name)!.includes(k)) stats.wished++;
        }
        const sh = shifts[k],
          [ns] = timeSpan(sh);
        const item: Entry = {
          id: makeId(),
          kind: 'Dienstplan',
          team: t.name,
          employee: name,
          shift: sh.name,
          groupId: '',
          groupName: '',
          start: sh.start,
          end: sh.end,
          color: shiftHexColor(sh.color || 'teal'),
          date,
        };
        entries.push(item);
        created.push(item);
        if (duty(name, dayOff(date, -1)).some((a) => 1440 + ns - timeSpan(a)[1] < 660)) stats.shortRest++;
      });
    });
  });
  return { entries, created, removed, stats };
}
