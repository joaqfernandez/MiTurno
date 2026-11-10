import { test, expect } from '@playwright/test';

// Las cabeceras de seguridad se definen en next.config.mjs. Si se endurecen de más, la página deja de
// cargar scripts, el mapa o la API: por eso se verifica también que una pantalla real no viole la política.
test('every page is served with security headers', async ({ request }) => {
  for (const path of ['/', '/login', '/medicos']) {
    const headers = (await request.get(path)).headers();
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy'], path).toContain("object-src 'none'");
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
  }
});

test('the booking page works without violating the content security policy', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto('/medicos');
  await page.getByRole('link', { name: /Ver agenda/ }).first().click();
  await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dónde atiende' })).toBeVisible();
  expect(violations).toEqual([]);
});
