import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'DemoTurnos2026!';

async function login(page: Page, email: string) {
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}

test('doctor shares a personal link, renames it and a patient books through the old one', async ({ page, browser }) => {
  // La médica ve su link automático (nombre y apellido) y lo cambia.
  await page.goto('/login');
  await login(page, 'valeria@example.com');
  await expect(page).toHaveURL(/panel/);
  await page.goto('/panel/configuracion');
  await expect(page.getByLabel('Tu link')).toHaveText('http://127.0.0.1:3101/valeriaroldan');
  await page.getByLabel('Cambiar el nombre del link').fill('dra-valeria-e2e');
  await page.getByRole('button', { name: 'Guardar link' }).click();
  await expect(page.getByText('Link actualizado')).toBeVisible();
  await expect(page.getByLabel('Tu link')).toHaveText('http://127.0.0.1:3101/dra-valeria-e2e');
  // Un nombre reservado se rechaza junto al campo, sin aviso general.
  await page.getByLabel('Cambiar el nombre del link').fill('admin');
  await page.getByRole('button', { name: 'Guardar link' }).click();
  await expect(page.getByText('Ese link ya está en uso. Probá con otro.')).toBeVisible();

  // Un paciente abre el link viejo (ya compartido) en otro navegador: llega al actual, sin indexación.
  const patient = await (await browser.newContext()).newPage();
  await patient.goto('/valeriaroldan');
  await expect(patient).toHaveURL(/\/dra-valeria-e2e$/);
  await expect(patient.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(patient.getByText('Volver a la búsqueda')).toHaveCount(0);
  await patient.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first().click();
  await patient.getByRole('button', { name: 'Ingresar para reservar' }).click();
  await login(patient, 'ana@example.com');
  // Después de ingresar vuelve al link del médico y reserva.
  await expect(patient).toHaveURL(/\/dra-valeria-e2e$/);
  await patient.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first().click();
  await patient.getByLabel('Motivo de consulta').fill('Reserva desde link del médico');
  await patient.getByRole('button', { name: 'Confirmar turno', exact: true }).click();
  await expect(patient.getByRole('heading', { name: '¡Turno confirmado!' })).toBeVisible();

  // Un link inexistente muestra su propio mensaje.
  await patient.goto('/no-existe-este-link');
  await expect(patient.getByText('Este link no existe')).toBeVisible();
  // Sin repetirlo en el aviso general (Next.js tiene un role=alert vacío propio; por eso se filtra por texto).
  await expect(patient.getByRole('alert').filter({ hasText: 'Link no encontrado' })).toHaveCount(0);
});
