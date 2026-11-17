import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('ohne Anmeldung geht es zur Login-Seite', async ({ page }) => {
  await page.goto('/dienstplan');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Willkommen zurück' })).toBeVisible();
});

test('Admin sieht alle Bereiche', async ({ page }) => {
  await loginAs(page, 'Alex Gruber');
  await expect(page.getByRole('heading', { name: /Guten Tag, Alex/ })).toBeVisible();
  for (const item of ['Dienstplan', 'Administration', 'Team Berechtigungen', 'Audit Log']) {
    await expect(page.locator(`#main-nav .nav-item[data-page="${item}"]`)).toHaveCount(1);
  }
});

test('Mitarbeiter sieht keine Verwaltung und wird gesperrt', async ({ page }) => {
  await loginAs(page, 'Daniel Winkler');
  await expect(page.getByRole('heading', { name: /Hallo Daniel/ })).toBeVisible();
  await expect(page.locator('#main-nav .nav-item[data-page="Administration"]')).toHaveCount(0);
  await page.goto('/administration');
  await expect(page.getByRole('heading', { name: 'Zugriff nicht möglich' })).toBeVisible();
});
