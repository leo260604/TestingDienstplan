import { describe, expect, it } from 'vitest';
import { allowedPages, perm, permsFor, visibleRole, pageFromPath } from '@/lib/permissions';
import { canEditEntry, canManageTeam, manageableTeams, selfEditAllowed, canCreateAbsenceFor, canNoteFor } from '@/lib/access';
import { demoCtx } from './helpers';

describe('Rollenrechte', () => {
  it('Admin darf alles, Einstellungen immer bearbeitbar', () => {
    expect(Object.values(permsFor('Admin')).every((v) => v === 'E')).toBe(true);
    expect(perm('Einstellungen', 'Mitarbeiter')).toBe('E');
  });
  it('Lohnverrechnung sieht keine Verwaltungsseiten', () => {
    const pages = allowedPages('Lohnverrechnung');
    expect(pages).toContain('Berichte / Export');
    expect(pages).not.toContain('Administration');
    expect(perm('Dienstplan', 'Lohnverrechnung')).toBe('R');
  });
  it('eigene Rollen bekommen nie automatisch Adminrechte', () => {
    expect(perm('Administration', 'Neue Rolle')).toBe('N');
    expect(perm('Dashboard', 'Neue Rolle')).toBe('R');
  });
  it('Deputy wird nur dem Admin angezeigt', () => {
    expect(visibleRole('Deputy', 'Mitarbeiter')).toBe('Mitarbeiter');
    expect(visibleRole('Deputy', 'Admin')).toBe('Deputy');
    expect(visibleRole('Admin', 'Mitarbeiter')).toBe('Mitarbeiter');
  });
  it('ordnet URLs Seiten zu', () => {
    expect(pageFromPath('/berichte')).toBe('Berichte / Export');
    expect(pageFromPath('/unbekannt')).toBeNull();
  });
});

describe('Teamrechte', () => {
  it('Teamleiter verwaltet nur das eigene Team', () => {
    const c = demoCtx('Laura Kern'); // Teamleitung Team Süd
    expect(c.user.role).toBe('Teamleiter');
    expect(canManageTeam(c, 'Team Süd')).toBe(true);
    expect(canManageTeam(c, 'Team Nord')).toBe(false);
    expect(manageableTeams(c, 'Dienstplan').map((t) => t.name)).toEqual(['Team Süd']);
  });
  it('Mitarbeiter darf nur mit Teamfreigabe selbst eintragen', () => {
    const c = demoCtx('Daniel Winkler');
    const team = c.data.teams.find((t) => t.memberIds.includes(c.user.id))!;
    expect(canEditEntry(c, team.name, c.user.name, 'Dienstplan')).toBe(false);
    team.settings = { selfDuty: 'all' };
    expect(selfEditAllowed(c, team.name, 'Dienstplan')).toBe(true);
    expect(canEditEntry(c, team.name, c.user.name, 'Dienstplan')).toBe(true);
    expect(canEditEntry(c, team.name, 'Alex Gruber', 'Dienstplan')).toBe(false);
  });
  it('Abwesenheiten und Notizen nur im eigenen Team', () => {
    const c = demoCtx('Daniel Winkler');
    const own = c.data.staff.find((p) => p.name === 'Alex Gruber');
    const other = c.data.staff.find((p) => p.name === 'Laura Kern');
    expect(canCreateAbsenceFor(c, own)).toBe(true);
    expect(canCreateAbsenceFor(c, other)).toBe(false);
    expect(canNoteFor(c, 'Daniel Winkler')).toBe(true);
    expect(canNoteFor(c, 'Alex Gruber')).toBe(false);
  });
});
