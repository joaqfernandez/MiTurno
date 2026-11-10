import { test, expect } from '@playwright/test';

// El ingreso con Google crea la cuenta sin pasar por el formulario de registro: antes de usar MiTurno
// tiene que aceptar los términos y autorizar el tratamiento de sus datos de salud.
test('a brand-new Google account must accept the terms before using the app', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await page.getByLabel('Cuenta de prueba').selectOption('nueva');
  await page.getByRole('button', { name: 'Autorizar prueba' }).click();
  await expect(page).toHaveURL(/\/legal\/aceptar$/);
  await expect(page.getByRole('heading', { name: 'Antes de continuar' })).toBeVisible();

  // Sin aceptar, cualquier pantalla con datos lo devuelve acá y la API no entrega nada.
  await page.goto('/mis-turnos');
  await expect(page).toHaveURL(/\/legal\/aceptar$/);
  const blocked = await page.evaluate(async () => {
    const response = await fetch('/api/appointments/me', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
    return [response.status, (await response.json()).code];
  });
  expect(blocked).toEqual([403, 'ACCEPTANCE_REQUIRED']);

  const accept = page.getByRole('button', { name: 'Aceptar y continuar' });
  await expect(accept).toBeDisabled();
  await page.getByLabel(/Acepto los términos y condiciones/).check();
  await expect(accept).toBeDisabled();
  await page.getByLabel(/Autorizo a MiTurno/).check();
  await accept.click();
  await expect(page).toHaveURL(/\/mis-turnos$/);

  // Ya puede reservar, y no se le vuelve a preguntar.
  await page.goto('/medicos');
  await page.getByRole('link', { name: /Ver agenda/ }).first().click();
  await page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first().click();
  await page.getByRole('button', { name: 'Confirmar turno', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¡Turno confirmado!' })).toBeVisible();
  await page.goto('/legal/aceptar');
  await expect(page).toHaveURL(/\/mis-turnos$/);
});
