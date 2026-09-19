import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/Contraseña/).fill('DemoTurnos2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}

test('patient logs in, books a real slot, reloads and sees clinical history', async ({ page }) => {
  await login(page, 'ana@example.com');
  await expect(page).toHaveURL(/mis-turnos/);
  await page.goto('/medicos');
  await page.getByRole('link', { name: /Ver agenda/ }).first().click();
  await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first().click();
  await page.getByLabel('Motivo de consulta').fill('Reserva de navegador');
  await page.getByRole('button', { name: 'Confirmar turno', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¡Turno confirmado!' })).toBeVisible();
  await page.goto('/mis-turnos');
  await expect(page.getByText('Motivo: Reserva de navegador')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Motivo: Reserva de navegador')).toBeVisible();
  await page.goto('/mi-historia');
  await expect(page.getByRole('heading', { name: 'Ejemplo ficticio' })).toBeVisible();
  await expect(page.getByText('Modo demostración elegido:', { exact: false })).toHaveCount(0);
});

test('doctor loads configuration, saves settings and accesses patients', async ({ page }) => {
  await login(page, 'valeria@example.com');
  await expect(page).toHaveURL(/panel/);
  await page.goto('/panel/configuracion');
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.goto('/panel/horarios');
  await expect(page.getByLabel('Desde (Lunes)')).toHaveValue('09:00');
  await page.goto('/panel/pacientes');
  await expect(page.getByText('Ana Castro', { exact: true })).toBeVisible();
});

test('admin sees verification queue and access is separated from patient session', async ({ page }) => {
  await login(page, 'admin@example.com');
  await expect(page).toHaveURL(/admin/);
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await expect(page.getByText('Matrícula: DEMO-VALERIA')).toBeVisible();
  await page.getByRole('button', { name: 'Salir', exact: true }).first().click();
  await login(page, 'ana@example.com');
  await page.goto('/admin');
  await expect(page.getByText('Ingresá con una cuenta administradora.')).toBeVisible();
  await expect(page.getByText('Matrícula: DEMO-VALERIA')).toHaveCount(0);
});
