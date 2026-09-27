import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'DemoTurnos2026!';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}

const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Mendoza' });

test('doctor blocks vacation days, is warned about booked appointments and resolves them', async ({ page, request }) => {
  // Un paciente reserva un turno lejano con Valeria; el médico intenta bloquear ese día.
  // Ana y no Lucas: account.spec.ts le cambia la contraseña a Lucas.
  const ana = await (await request.post('/api/auth/login', { data: { email: 'ana@example.com', password: PASSWORD } })).json();
  const [valeria] = await (await request.get('/api/doctors', { params: { q: 'Valeria' } })).json();
  const from = new Date(Date.now() + 40 * 86_400_000);
  const slots = await (await request.get(`/api/appointments/availability/${valeria.id}`, {
    params: { from: from.toISOString(), to: new Date(from.getTime() + 7 * 86_400_000).toISOString() },
  })).json();
  const booked = await request.post('/api/appointments', {
    headers: { Authorization: `Bearer ${ana.accessToken}` },
    data: { doctorId: valeria.id, startAt: slots[0].startAt },
  });
  expect(booked.status()).toBe(201);
  const bookedId = (await booked.json()).id;
  const day = localDate(slots[0].startAt);

  await login(page, 'valeria@example.com');
  await expect(page).toHaveURL(/panel/);
  await page.getByRole('link', { name: 'Días libres' }).click();
  await expect(page.getByRole('heading', { name: 'Días libres y vacaciones' })).toBeVisible();
  await page.locator('#from').fill(day);
  await page.locator('#to').fill(day);
  await page.getByLabel('Motivo (opcional)').fill('Vacaciones de prueba');
  await page.getByRole('button', { name: 'Bloquear fechas' }).click();

  // No se bloquea: aparece el turno de Ana y nada quedó guardado.
  await expect(page.getByRole('alert').filter({ hasText: 'Tenés 1 turno en esas fechas' })).toBeVisible();
  const conflicts = page.getByRole('list', { name: 'Turnos en esas fechas' });
  await expect(conflicts.getByText('Ana Castro')).toBeVisible();
  await expect(page.getByText('No tenés fechas bloqueadas')).toBeVisible();

  // El médico cancela el turno desde ahí y vuelve a bloquear.
  await conflicts.getByRole('button', { name: 'Cancelar turno' }).click();
  await page.getByRole('dialog', { name: 'Cancelar turno' }).getByRole('button', { name: 'Cancelar turno' }).click();
  await expect(conflicts).toHaveCount(0);
  await page.getByRole('button', { name: 'Bloquear fechas' }).click();
  await expect(page.getByText('Fechas bloqueadas', { exact: true })).toBeVisible();
  const blocks = page.getByRole('list', { name: 'Próximos bloqueos' });
  await expect(blocks.getByText('Vacaciones de prueba')).toBeVisible();

  // El paciente ya no ve turnos ese día, y el turno quedó cancelado para él.
  const dayStart = new Date(`${day}T00:00:00-03:00`);
  const after = await (await request.get(`/api/appointments/availability/${valeria.id}`, {
    params: { from: dayStart.toISOString(), to: new Date(dayStart.getTime() + 86_400_000).toISOString() },
  })).json();
  expect(after).toEqual([]);
  const mine = await (await request.get('/api/appointments/me', { headers: { Authorization: `Bearer ${ana.accessToken}` } })).json();
  expect(mine.find((a: { id: string }) => a.id === bookedId)?.status).toBe('CANCELLED_BY_DOCTOR');

  // Quitar el bloqueo vuelve a liberar el día, también después de recargar.
  await page.reload();
  await blocks.getByRole('button', { name: /Quitar bloqueo/ }).click();
  await page.getByRole('dialog', { name: 'Quitar bloqueo' }).getByRole('button', { name: 'Quitar bloqueo' }).click();
  await expect(page.getByText('No tenés fechas bloqueadas')).toBeVisible();
});
