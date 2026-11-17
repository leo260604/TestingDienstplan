import { expect, type Page } from '@playwright/test';

/** Demo-Anmeldung („Benutzer wählen“) – benötigt AUTH_DEMO_LOGIN=true und die Seed-Daten */
export async function loginAs(page: Page, name: string) {
  await page.goto('/login');
  const demo = page.locator('details.login-demo');
  if (!(await demo.evaluate((d) => (d as HTMLDetailsElement).open))) await demo.locator('summary').click();
  await page.getByPlaceholder('Name suchen …').fill(name);
  await page.locator('.login-user', { hasText: name }).first().click();
  await page.getByRole('button', { name: `Als ${name} anmelden` }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.locator('.top-avatar')).toBeVisible();
}

/** Auswahl im Picker eines Feldes (Label) treffen */
export async function pick(page: Page, scope: ReturnType<Page['locator']>, label: string, option: string) {
  const field = scope.locator('.wp-field', { has: page.locator('.wp-label', { hasText: label }) }).first();
  await field.locator('.pp-btn').click();
  await field.locator('.pp-opt', { hasText: option }).first().click();
}
