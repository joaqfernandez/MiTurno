import { test, expect, type APIRequestContext } from '@playwright/test';

async function latestLink(request: APIRequestContext, to: string, page: string, previous?: string) {
  let link: string | undefined;
  await expect.poll(async () => {
    const { text } = await (await request.get(`http://127.0.0.1:3100/test-mailbox?to=${encodeURIComponent(to)}`)).json();
    link = text?.match(new RegExp(`http://127\\.0\\.0\\.1:3101/${page}#token=[A-Za-z0-9_-]+`))?.[0];
    return link !== previous && link;
  }, { timeout: 15_000 }).toBeTruthy();
  return link!;
}

async function loginWith(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/Contraseña/).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}

test('forgotten password: email link sets a new password and the old one stops working', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await page.getByLabel('Email de tu cuenta').fill('lucas@example.com');
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('status')).toContainText('Si hay una cuenta con ese email');

  await page.goto(await latestLink(request, 'lucas@example.com', 'restablecer-contrasena'));
  // El token se borra de la barra de direcciones apenas se lee.
  await expect(page).toHaveURL(/\/restablecer-contrasena$/);
  await page.getByLabel('Contraseña nueva').fill('Nueva-clave-e2e-2026');
  await page.getByLabel('Repetí la contraseña').fill('Nueva-clave-e2e-2026');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('Tu contraseña se actualizó');

  await loginWith(page, 'lucas@example.com', 'DemoTurnos2026!');
  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  await loginWith(page, 'lucas@example.com', 'Nueva-clave-e2e-2026');
  await expect(page).toHaveURL(/mis-turnos/);
});

test('new patient must confirm the email before logging in', async ({ page, request }) => {
  const email = `nuevo-${Date.now()}@example.com`;
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill('Nuevo');
  await page.getByLabel('Apellido').fill('Paciente');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(/Contraseña/).fill('Clave-paciente-2026');
  await page.getByLabel(/Teléfono/).fill('11 2345 6789');
  await page.locator('form').getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('status')).toContainText('Revisá tu correo');

  const first = await latestLink(request, email, 'verificar-email');
  await loginWith(page, email, 'Clave-paciente-2026');
  await expect(page.getByText('Confirmá tu email para ingresar')).toBeVisible();
  await page.getByRole('button', { name: 'Reenviar email de confirmación' }).click();
  await expect(page.getByRole('status')).toContainText('te enviamos un nuevo link');

  // El reenvío anula el primer link: solo sirve el nuevo.
  const second = await latestLink(request, email, 'verificar-email', first);
  await page.goto(first);
  await page.getByRole('button', { name: 'Confirmar mi email' }).click();
  await expect(page.getByText('El link no es válido o ya venció')).toBeVisible();
  await page.goto(second);
  await page.getByRole('button', { name: 'Confirmar mi email' }).click();
  await expect(page.getByRole('status')).toContainText('Tu email quedó confirmado');

  await loginWith(page, email, 'Clave-paciente-2026');
  await expect(page).toHaveURL(/mis-turnos/);
});
