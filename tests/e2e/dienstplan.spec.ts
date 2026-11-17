import { expect, test } from '@playwright/test';
import { loginAs, pick } from './helpers';

/* Ein fester Werktag in der Zukunft, damit der Test unabhängig vom heutigen Datum ist */
const DATE = '2030-03-12'; // Dienstag

test.describe('Dienstplan', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop-Ablauf');

  test('Dienst einteilen, im Kalender sehen und wieder löschen', async ({ page }) => {
    await loginAs(page, 'Alex Gruber');
    await page.goto(`/dienstplan?date=${DATE}&view=Woche&team=Team%20Nord`);
    await page.getByRole('button', { name: 'Eintrag erstellen' }).click();
    const dlg = page.locator('.modal.duty-modal');
    await expect(dlg).toBeVisible();
    await pick(page, dlg, 'Team', 'Team Nord');
    await pick(page, dlg, 'Mitarbeiter', 'Julia Lang');
    await pick(page, dlg, 'Dienst', 'Spätdienst');
    const dates = dlg.locator('input[type=date]');
    await dates.nth(0).fill(DATE);
    await dates.nth(1).fill(DATE);
    await dlg.getByRole('button', { name: 'Dienst einteilen' }).click();
    await expect(page.locator('.toast')).toContainText('Eintrag wurde erfolgreich angelegt');

    const card = page.locator(`.week-day-cell[data-calendar-day="${DATE}"] .calendar-assignment`, { hasText: 'Julia Lang' });
    await expect(card).toContainText('Spätdienst');

    await card.locator('.duty-actions-sum').click();
    await page.locator('.duty-actions-menu').getByRole('button', { name: 'Löschen' }).click();
    await page.locator('.app-dialog').getByRole('button', { name: 'Löschen' }).click();
    await expect(page.locator('.toast')).toContainText('Eintrag wurde gelöscht');
    await expect(card).toHaveCount(0);
  });

  test('an Feiertagen sind keine Dienste möglich', async ({ page }) => {
    await loginAs(page, 'Alex Gruber');
    await page.goto('/dienstplan?date=2030-12-25&view=Woche');
    await expect(page.locator('.hol-badge', { hasText: 'Christtag' }).first()).toBeVisible();
  });
});
