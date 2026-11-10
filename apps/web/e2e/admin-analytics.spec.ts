import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('admin sees the numbers, exports them and cannot open a clinical history', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('admin@example.com');
  await page.getByLabel(/Contraseña/).fill('DemoTurnos2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.goto('/admin');
  const numbers = page.getByRole('region', { name: 'Números de MiTurno' });
  await expect(numbers.getByText('Médicos activos', { exact: true })).toBeVisible();
  // El seed tiene dos médicos, una en cada especialidad.
  await expect(numbers.getByRole('list', { name: 'Médicos por especialidad' }).getByRole('listitem')).toHaveCount(2);
  await expect(numbers.getByRole('list', { name: 'Edad de los pacientes' })).toContainText('Sin dato');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/admin.png`, fullPage: true });

  const download = page.waitForEvent('download');
  await numbers.getByRole('button', { name: 'Exportar medicos en CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^miturno-medicos-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = fs.readFileSync(await file.path(), 'utf8');
  expect(csv).toContain('Apellido;Nombre;Email;Matrícula;Estado;Especialidades;Alta;Turnos;Turnos últimos 30 días');
  expect(csv).toContain('Roldán;Valeria;valeria@example.com');
  // Ningún paciente en el archivo.
  expect(csv).not.toContain('ana@example.com');
  expect(csv).not.toContain('Castro');

  // El administrador no lee historias clínicas: la API se lo niega.
  const status = await page.evaluate(async () => {
    const mine = await fetch('/api/appointments/me', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
    const anyPatient = await fetch('/api/medical-records/cualquiera', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
    return [mine.status, anyPatient.status];
  });
  expect(status).toEqual([200, 403]);
});
