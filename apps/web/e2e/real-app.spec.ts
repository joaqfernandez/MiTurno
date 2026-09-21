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

for (const [account, destination] of [['ana', '/mis-turnos'], ['valeria', '/panel'], ['admin', '/admin']]) {
  test(`Google callback preserves ${account} session through real Python routes`, async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await page.getByLabel('Cuenta de prueba').selectOption(account);
    await page.getByRole('button', { name: 'Autorizar prueba' }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:3101${destination}`);
    expect(await page.evaluate(() => localStorage.getItem('refreshToken'))).toBeTruthy();
    await page.reload();
    if (account === 'ana') {
      await page.goto('/mi-historia');
      await expect(page.getByRole('heading', { name: 'Ejemplo ficticio' })).toBeVisible();
    } else if (account === 'admin') {
      await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
    } else {
      await page.goto('/panel/pacientes');
      await expect(page.getByText('Ana Castro', { exact: true })).toBeVisible();
    }
  });
}

for (const [email, destination] of [['ana@example.com', '/mis-turnos'], ['valeria@example.com', '/panel']]) {
  test(`suspending an open ${email} session clears credentials and clinical data`, async ({ page, request }) => {
    const admin = await (await request.post('/api/auth/login', {data:{email:'admin@example.com', password:'DemoTurnos2026!'}})).json();
    const account = await (await request.post('/api/auth/login', {data:{email, password:'DemoTurnos2026!'}})).json();
    const headers = {Authorization:`Bearer ${admin.accessToken}`};
    await login(page, email);
    await expect(page).toHaveURL(new RegExp(destination));
    try {
      const result = await request.patch(`/api/admin/users/${account.user.id}/status`, {headers, data:{status:'SUSPENDED'}});
      expect(result.ok()).toBeTruthy();
      await page.goto(email.startsWith('ana') ? '/mi-historia' : '/panel/pacientes');
      await expect(page.getByRole('alert').filter({hasText:'Tu sesión terminó'})).toBeVisible();
      await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem('refreshToken'))).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem('miturno.session'))).toBeNull();
      await expect(page.getByRole('heading', {name:'Ejemplo ficticio'})).toHaveCount(0);
    } finally {
      expect((await request.patch(`/api/admin/users/${account.user.id}/status`, {headers, data:{status:'ACTIVE'}})).ok()).toBeTruthy();
    }
    await login(page, email);
    await expect(page).toHaveURL(new RegExp(destination));
  });
}

test('doctor amends own clinical entry without losing its original appointment', async ({ page, request }) => {
  const patient = await (await request.post('/api/auth/login', {data:{email:'ana@example.com', password:'DemoTurnos2026!'}})).json();
  const patientId = patient.user.patientProfileId;
  await login(page, 'valeria@example.com');
  await expect(page).toHaveURL(/panel/);
  await page.goto(`/panel/pacientes/${patientId}`);
  await expect(page.getByRole('heading', {name:'Ejemplo ficticio'})).toBeVisible();
  await page.getByRole('button', {name:'Nueva evolución', exact:true}).click();
  await page.getByLabel(/^Título/).fill('Corrección desde navegador');
  await page.getByLabel(/^Evolución clínica/).fill('Contenido ficticio corregido');
  const originalOption = page.getByLabel('Enmienda de', {exact:true}).locator('option').filter({hasText:'Ejemplo ficticio'});
  const originalId = await originalOption.getAttribute('value');
  await page.getByLabel('Enmienda de', {exact:true}).selectOption(originalId!);
  const created = page.waitForResponse(response => response.url().endsWith('/api/medical-records/entries') && response.request().method() === 'POST');
  await page.getByRole('button', {name:'Firmar y guardar', exact:true}).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const correction = await response.json();
  expect(correction.amendsEntryId).toBe(originalId);
  expect(correction.appointmentId).toBeTruthy();
  await expect(page.getByRole('heading', {name:'Corrección desde navegador'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name:'Ejemplo ficticio'})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Corrección desde navegador'})).toBeVisible();
});

test('colleague can read history but cannot select another authors entry for amendment', async ({ page, request }) => {
  const patient = await (await request.post('/api/auth/login', {data:{email:'ana@example.com', password:'DemoTurnos2026!'}})).json();
  const doctor = await (await request.post('/api/auth/login', {data:{email:'pedro@example.com', password:'DemoTurnos2026!'}})).json();
  const start = new Date(Date.now() + 7 * 86400000);
  const end = new Date(start.getTime() + 7 * 86400000);
  const offered = await (await request.get(`/api/appointments/availability/${doctor.user.doctorProfileId}`, {
    params:{from:start.toISOString(), to:end.toISOString()},
  })).json();
  expect(offered.length).toBeGreaterThan(0);
  const reservation = await request.post('/api/appointments', {
    headers:{Authorization:`Bearer ${patient.accessToken}`},
    data:{doctorId:doctor.user.doctorProfileId, startAt:offered[0].startAt},
  });
  expect(reservation.status()).toBe(201);
  await login(page, 'pedro@example.com');
  await expect(page).toHaveURL(/panel/);
  await page.goto(`/panel/pacientes/${patient.user.patientProfileId}`);
  await expect(page.getByRole('heading', {name:'Ejemplo ficticio'})).toBeVisible();
  await page.getByRole('button', {name:'Nueva evolución', exact:true}).click();
  await expect(page.getByLabel('Enmienda de', {exact:true})).toHaveCount(0);
  await page.getByLabel(/^Título/).fill('Evolución propia de Pedro');
  await page.getByLabel(/^Evolución clínica/).fill('Nota ficticia del colega');
  await page.getByRole('button', {name:'Firmar y guardar', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Evolución propia de Pedro'})).toBeVisible();
});

test('rejected clinical reference preserves the draft and shows the API error', async ({ page, request }) => {
  const patient = await (await request.post('/api/auth/login', {data:{email:'ana@example.com', password:'DemoTurnos2026!'}})).json();
  await login(page, 'valeria@example.com');
  await expect(page).toHaveURL(/panel/);
  await page.goto(`/panel/pacientes/${patient.user.patientProfileId}`);
  await expect(page.getByRole('heading', {name:'Ejemplo ficticio'})).toBeVisible();
  await page.getByRole('button', {name:'Nueva evolución', exact:true}).click();
  await page.getByLabel(/^Título/).fill('Borrador conservado');
  await page.getByLabel(/^Evolución clínica/).fill('Texto que no debe perderse');
  // Manipula solo la referencia enviada; la validación y el error son del backend real.
  await page.route('**/api/medical-records/entries', route => route.continue({
    postData:JSON.stringify({...route.request().postDataJSON(), amendsEntryId:'does-not-exist'}),
  }));
  await page.getByRole('button', {name:'Firmar y guardar', exact:true}).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('La enmienda debe pertenecer a esta historia');
  await expect(page.getByLabel(/^Título/)).toHaveValue('Borrador conservado');
  await expect(page.getByLabel(/^Evolución clínica/)).toHaveValue('Texto que no debe perderse');
  await expect(page.getByRole('heading', {name:'Borrador conservado'})).toHaveCount(0);
});
