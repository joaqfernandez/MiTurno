import { test, expect } from '@playwright/test';

const PASSWORD = 'DemoTurnos2026!';

test('patient pages through doctors, searches by specialty and recovers from an API error', async ({ page, request }) => {
  // 13 médicos activos de apellido «Zeta»: se ordenan al final, así no cambian el primer médico que usan otros recorridos.
  const admin = await (await request.post('/api/auth/login', { data: { email: 'admin@example.com', password: PASSWORD } })).json();
  const headers = { Authorization: `Bearer ${admin.accessToken}` };
  for (let i = 1; i <= 13; i++) {
    const n = String(i).padStart(2, '0');
    const created = await request.post('/api/auth/register', {
      data: { email: `zeta${n}@example.com`, password: PASSWORD, firstName: `Medico${n}`, lastName: 'Zeta', role: 'DOCTOR', licenseNumber: `ZETA-${n}` },
    });
    expect(created.status()).toBe(202);
  }
  const doctors: Array<{ userId: string; lastName: string }> = await (await request.get('/api/admin/doctors', { headers })).json();
  for (const doctor of doctors.filter((d) => d.lastName === 'Zeta')) {
    expect((await request.patch(`/api/admin/users/${doctor.userId}/status`, { headers, data: { status: 'ACTIVE' } })).ok()).toBeTruthy();
  }

  // Páginas de 12: la segunda tiene el médico 13; la página queda en la URL y sobrevive a recargar.
  const cards = page.getByRole('link', { name: /Ver agenda/ });
  await page.goto('/medicos?q=zeta');
  await expect(page.getByText('13 médicos · Página 1 de 2')).toBeVisible();
  await expect(cards).toHaveCount(12);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByText('13 médicos · Página 2 de 2')).toBeVisible();
  await expect(cards).toHaveCount(1);
  await expect(page.getByText('Medico13 Zeta')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Medico13 Zeta')).toBeVisible();
  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(cards).toHaveCount(12);

  // Escribir la especialidad encuentra a sus médicos (Pedro Gómez es cardiólogo en los datos de prueba).
  await page.getByLabel('Buscar por nombre o especialidad').fill('Cardiología');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Pedro Gómez')).toBeVisible();
  await expect(page.getByText('1 médico', { exact: true })).toBeVisible();

  // Si la API falla, se explica y se puede reintentar; nunca queda una lista en blanco.
  await page.route('**/api/doctors?*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Error interno"}' }));
  await page.goto('/medicos?q=valeria');
  await expect(page.getByText('No pudimos cargar los médicos')).toBeVisible();
  await page.unroute('**/api/doctors?*');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Valeria Roldán')).toBeVisible();
});
