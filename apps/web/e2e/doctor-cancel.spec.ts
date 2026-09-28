import { test, expect } from '@playwright/test';

const PASSWORD = 'DemoTurnos2026!';
const ZONE = 'America/Argentina/Mendoza';

test('doctor cancels an appointment from the agenda with a reason the patient receives', async ({ page, request }) => {
  // Ana reserva un turno lejano con Valeria (dentro de los 60 días que muestra la agenda).
  const ana = await (await request.post('/api/auth/login', { data: { email: 'ana@example.com', password: PASSWORD } })).json();
  const { items: [valeria] } = await (await request.get('/api/doctors', { params: { q: 'Valeria' } })).json();
  const from = new Date(Date.now() + 50 * 86_400_000);
  const slots = await (await request.get(`/api/appointments/availability/${valeria.id}`, {
    params: { from: from.toISOString(), to: new Date(from.getTime() + 7 * 86_400_000).toISOString() },
  })).json();
  const booked = await request.post('/api/appointments', {
    headers: { Authorization: `Bearer ${ana.accessToken}` },
    data: { doctorId: valeria.id, startAt: slots[0].startAt, reason: 'Control anual' },
  });
  expect(booked.status()).toBe(201);
  const { id } = await booked.json();
  const start = new Date(slots[0].startAt);
  const dayLabel = start.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: ZONE });
  const hour = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE });

  // La médica va al día en su agenda y cancela con un motivo.
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('valeria@example.com');
  await page.getByLabel(/Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/panel/);
  const day = page.getByRole('button', { name: new RegExp(`^${dayLabel}, `) });
  for (let i = 0; i < 3 && !(await day.isVisible()); i++) await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await day.click();
  await page.getByRole('button', { name: `Cancelar turno de Ana Castro a las ${hour}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancelar turno' });
  await dialog.getByLabel('Motivo (opcional)').fill('Tengo un congreso ese día');
  await dialog.getByRole('button', { name: 'Cancelar turno' }).click();
  await expect(page.getByText('Turno de Ana Castro cancelado. Le avisamos por email.')).toBeVisible();
  await expect(page.getByRole('button', { name: `Cancelar turno de Ana Castro a las ${hour}` })).toHaveCount(0);

  // Para la paciente el turno quedó cancelado por el médico, con el motivo.
  const mine = await (await request.get('/api/appointments/me', { headers: { Authorization: `Bearer ${ana.accessToken}` } })).json();
  const cancelled = mine.find((a: { id: string }) => a.id === id);
  expect([cancelled.status, cancelled.cancellationReason]).toEqual(['CANCELLED_BY_DOCTOR', 'Tengo un congreso ese día']);
});
