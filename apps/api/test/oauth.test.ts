import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OAuthStateService } from '../src/modules/oauth/oauth-state.service';
import { GoogleAuthService } from '../src/modules/auth/google-auth.service';
import { GoogleAuthController } from '../src/modules/auth/google-auth.controller';
import { CalendarController } from '../src/modules/calendar/calendar.controller';

function response() {
  const cookies: Record<string, { value: string; options: any }> = {};
  const cleared: string[] = [];
  let location = '';
  const res = {
    cookie(name: string, value: string, options: any) { cookies[name] = { value, options }; },
    clearCookie(name: string) { cleared.push(name); },
    setHeader() {},
    redirect(url: string) { location = url; },
  } as any;
  return { res, cookies, cleared, location: () => location };
}

function stateFixture() {
  const rows = new Map<string, any>();
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) =>
    key === 'expiresAt' ? (value.gt ? row.expiresAt > value.gt : row.expiresAt <= value.lte) : row[key] === value);
  const prisma = { oAuthRequest: {
    async create({ data }: any) { rows.set(data.tokenHash, data); return data; },
    async findFirst({ where }: any) { return [...rows.values()].find((row) => matches(row, where)) ?? null; },
    async deleteMany({ where }: any) {
      let count = 0;
      for (const [key, row] of rows) if (matches(row, where)) { rows.delete(key); count++; }
      return { count };
    },
  } } as any;
  const service = new OAuthStateService(prisma);
  const out = response();
  const req = (purpose = 'login', binding = out.cookies[`miturno_oauth_${purpose}`]?.value) =>
    ({ headers: { cookie: binding ? `miturno_oauth_${purpose}=${binding}` : '' } }) as any;
  return { service, rows, req, ...out };
}

test('state is random, hashed, expires and is bound to an HttpOnly cookie', async () => {
  const f = stateFixture();
  const first = await f.service.create('login', f.res);
  const second = await f.service.create('login', f.res);
  assert.match(first.state, /^[a-f0-9]{64}$/);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.nonce, second.nonce);
  const row = [...f.rows.values()][1];
  assert.notEqual(row.tokenHash, second.state);
  assert.notEqual(row.bindingHash, f.cookies.miturno_oauth_login.value);
  assert.ok(row.expiresAt.getTime() > Date.now() + 590_000);
  assert.equal(f.cookies.miturno_oauth_login.options.httpOnly, true);
  assert.equal(f.cookies.miturno_oauth_login.options.sameSite, 'lax');
});

test('production cookies require HTTPS', async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const f = stateFixture();
    await f.service.create('calendar', f.res, 'doctor-1');
    assert.equal(f.cookies.miturno_oauth_calendar.options.secure, true);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

for (const invalid of [undefined, '', ['abc'], {}, 'doctor-1', 'f'.repeat(64)]) {
  test(`reject invalid or unknown state: ${JSON.stringify(invalid)}`, async () => {
    const f = stateFixture();
    await f.service.create('login', f.res);
    await assert.rejects(f.service.consume('login', invalid, f.req(), f.res));
    assert.equal(f.rows.size, 1);
  });
}

test('reject a missing cookie or a different browser, without consuming the valid request', async () => {
  const f = stateFixture();
  const { state } = await f.service.create('login', f.res);
  await assert.rejects(f.service.consume('login', state, f.req('login', ''), f.res));
  await assert.rejects(f.service.consume('login', state, f.req('login', 'f'.repeat(64)), f.res));
  assert.equal(f.rows.size, 1);
  await f.service.consume('login', state, f.req(), f.res);
});

test('reject expired state', async () => {
  const f = stateFixture();
  const { state } = await f.service.create('login', f.res);
  [...f.rows.values()][0].expiresAt = new Date(Date.now() - 1);
  await assert.rejects(f.service.consume('login', state, f.req(), f.res));
});

test('login state cannot authorize calendar, even with the same cookie value', async () => {
  const f = stateFixture();
  const { state } = await f.service.create('login', f.res);
  await assert.rejects(f.service.consume('calendar', state,
    f.req('calendar', f.cookies.miturno_oauth_login.value), f.res));
});

test('calendar retrieves the doctor from storage and rejects replay', async () => {
  const f = stateFixture();
  const { state } = await f.service.create('calendar', f.res, 'doctor-1');
  const stored = await f.service.consume('calendar', state, f.req('calendar'), f.res);
  assert.equal(stored.subjectId, 'doctor-1');
  await assert.rejects(f.service.consume('calendar', state, f.req('calendar'), f.res));
  assert.ok(f.cleared.includes('miturno_oauth_calendar'));
});

test('only one concurrent callback can consume state', async () => {
  const f = stateFixture();
  const { state } = await f.service.create('login', f.res);
  const results = await Promise.allSettled([
    f.service.consume('login', state, f.req(), f.res),
    f.service.consume('login', state, f.req(), f.res),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

test('session handoff uses a short-lived single-use cookie', async () => {
  const f = stateFixture();
  await f.service.create('session', f.res, 'user-1');
  assert.equal(f.cookies.miturno_oauth_session.options.maxAge, 60_000);
  const stored = await f.service.consumeSession(f.req('session'), f.res);
  assert.equal(stored.subjectId, 'user-1');
  await assert.rejects(f.service.consumeSession(f.req('session'), f.res));
});

test('invalid calendar state never exchanges the code or writes calendar tokens', async () => {
  const f = stateFixture();
  let exchanges = 0;
  const controller = new CalendarController({ handleOAuthCallback: async () => { exchanges++; } } as any,
    {} as any, f.service);
  await controller.callback('code', 'doctor-id', undefined, f.req('calendar'), f.res);
  assert.equal(exchanges, 0);
  assert.ok(f.location().endsWith('?calendar=error'));
});

test('valid calendar callback uses stored doctor; denial consumes state without exchanging code', async () => {
  const f = stateFixture();
  let received: any[] = [];
  const controller = new CalendarController({ handleOAuthCallback: async (...args: any[]) => { received = args; } } as any,
    {} as any, f.service);
  const valid = await f.service.create('calendar', f.res, 'doctor-1');
  await controller.callback('google-code', valid.state, undefined, f.req('calendar'), f.res);
  assert.deepEqual(received, ['google-code', 'doctor-1']);
  assert.ok(f.location().endsWith('?calendar=ok'));
  received = [];
  const denied = await f.service.create('calendar', f.res, 'doctor-1');
  await controller.callback(undefined, denied.state, 'access_denied', f.req('calendar'), f.res);
  assert.deepEqual(received, []);
  assert.equal(f.rows.size, 0);
});

function googleFixture(overrides: Record<string, any> = {}, existing: any = null, bySubject: any = null) {
  const payload = { sub: 'google-subject', email: 'patient@gmail.com', email_verified: true,
    nonce: 'expected-nonce', given_name: 'Ana', family_name: 'Perez', ...overrides };
  let created: any;
  let linked: any;
  let verification: any;
  const user = {
    async findUnique() { return bySubject; },
    async findFirst() { return existing; },
    async create({ data }: any) { created = data; return { id: 'new-patient' }; },
    async updateMany(args: any) { linked = args; return { count: 1 }; },
  };
  const service = new GoogleAuthService({ user, $transaction: async (fn: any) => fn({ user }) } as any);
  (service as any).client = () => ({
    async getToken() { return { tokens: { id_token: 'signed-token' } }; },
    async verifyIdToken(args: any) { verification = args; return { getPayload: () => payload }; },
  });
  return { service, created: () => created, linked: () => linked, verification: () => verification };
}

test('first Google login creates an active patient and verifies the ID token', async () => {
  const f = googleFixture();
  assert.equal(await f.service.authenticate('code', 'expected-nonce'), 'new-patient');
  assert.equal(f.verification().idToken, 'signed-token');
  assert.equal(f.verification().audience, process.env.GOOGLE_CLIENT_ID);
  assert.deepEqual(f.created().roles, ['PATIENT']);
  assert.equal(f.created().status, 'ACTIVE');
  assert.equal(f.created().googleSubject, 'google-subject');
  assert.equal(f.created().patientProfile.create.firstName, 'Ana');
  assert.equal(f.created().doctorProfile, undefined);
});

for (const invalid of [{ nonce: 'wrong' }, { nonce: undefined }, { email_verified: false }, { sub: '' }, { email: '' }]) {
  test(`reject invalid identity claims: ${JSON.stringify(invalid)}`, async () => {
    const f = googleFixture(invalid);
    await assert.rejects(f.service.authenticate('code', 'expected-nonce'));
    assert.equal(f.created(), undefined);
    assert.equal(f.linked(), undefined);
  });
}

test('invalid signature/audience rejection propagates before user lookup', async () => {
  const f = googleFixture();
  (f.service as any).client = () => ({
    async getToken() { return { tokens: { id_token: 'forged' } }; },
    async verifyIdToken() { throw new Error('Invalid signature'); },
  });
  await assert.rejects(f.service.authenticate('code', 'expected-nonce'));
  assert.equal(f.created(), undefined);
});

test('known Google subject retains existing account even if its Google email changed', async () => {
  const f = googleFixture({ email: 'changed@gmail.com' }, null, { id: 'doctor-1', status: 'ACTIVE' });
  assert.equal(await f.service.authenticate('code', 'expected-nonce'), 'doctor-1');
  assert.equal(f.created(), undefined);
  assert.equal(f.linked(), undefined);
});

test('existing Gmail requires proof of access to the local account, then retains roles', async () => {
  const f = googleFixture({}, { id: 'doctor-1', googleSubject: null, status: 'ACTIVE', roles: ['DOCTOR'] });
  await assert.rejects(f.service.authenticate('code', 'expected-nonce'));
  assert.equal(f.linked(), undefined);
  assert.equal(await f.service.authenticate('code', 'expected-nonce', 'doctor-1'), 'doctor-1');
  assert.deepEqual(f.linked().data, { googleSubject: 'google-subject' });
});

test('verified Workspace email also requires local authentication to link an existing account', async () => {
  const f = googleFixture({ email: 'doctor@clinic.example', hd: 'clinic.example' },
    { id: 'doctor-1', googleSubject: null, status: 'ACTIVE' });
  await assert.rejects(f.service.authenticate('code', 'expected-nonce'));
  assert.equal(await f.service.authenticate('code', 'expected-nonce', 'doctor-1'), 'doctor-1');
});

test('third-party email does not auto-link an existing account', async () => {
  const f = googleFixture({ email: 'patient@example.com' }, { id: 'existing', googleSubject: null, status: 'ACTIVE' });
  await assert.rejects(f.service.authenticate('code', 'expected-nonce'));
  assert.equal(f.linked(), undefined);
  assert.equal(await f.service.authenticate('code', 'expected-nonce', 'existing'), 'existing');
});

test('a different local user cannot link the identity, and mismatched emails cannot create an account during linking', async () => {
  const f = googleFixture({}, { id: 'doctor-1', googleSubject: null, status: 'ACTIVE' });
  await assert.rejects(f.service.authenticate('code', 'expected-nonce', 'another-user'));
  const missing = googleFixture();
  await assert.rejects(missing.service.authenticate('code', 'expected-nonce', 'another-user'));
  assert.equal(missing.created(), undefined);
  const alreadyLinked = googleFixture({}, null, { id: 'doctor-1', status: 'ACTIVE' });
  await assert.rejects(alreadyLinked.service.authenticate('code', 'expected-nonce', 'another-user'));
});

test('reject a Google identity already linked to a different subject', async () => {
  const f = googleFixture({}, { id: 'existing', googleSubject: 'another-subject', status: 'ACTIVE' });
  await assert.rejects(f.service.authenticate('code', 'expected-nonce'));
});

test('suspended users cannot sign in with Google or link their account', async () => {
  for (const f of [googleFixture({}, null, { id: 'suspended', status: 'SUSPENDED' }),
    googleFixture({}, { id: 'suspended', status: 'SUSPENDED', googleSubject: null })]) {
    await assert.rejects(f.service.authenticate('code', 'expected-nonce'));
  }
});

test('login callback validates state before Google and returns no tokens in its URL', async () => {
  const f = stateFixture();
  let calls = 0;
  const controller = new GoogleAuthController({ authenticate: async () => { calls++; return 'user-1'; } } as any,
    f.service, {} as any);
  await controller.callback('code', 'invalid', undefined, f.req(), f.res);
  assert.equal(calls, 0);
  const { state } = await f.service.create('login', f.res);
  await controller.callback('code', state, undefined, f.req(), f.res);
  assert.equal(calls, 1);
  assert.ok(f.location().endsWith('/auth/google/callback'));
  assert.ok(f.cookies.miturno_oauth_session);
  assert.ok(!f.location().includes('?'));
});

test('session completion rejects a foreign Origin before consuming the session', async () => {
  const f = stateFixture();
  let issued = 0;
  const controller = new GoogleAuthController({} as any, f.service,
    { issueTokens: async () => { issued++; } } as any);
  await f.service.create('session', f.res, 'user-1');
  const previous = process.env.WEB_URL;
  process.env.WEB_URL = 'https://miturno.example';
  try {
    const req = f.req('session');
    req.headers.origin = 'https://attacker.example';
    await assert.rejects(controller.complete(req, f.res));
    assert.equal(issued, 0);
    assert.equal(f.rows.size, 1);
    req.headers.origin = process.env.WEB_URL;
    await controller.complete(req, f.res);
    assert.equal(issued, 1);
    await assert.rejects(controller.complete(req, f.res));
  } finally {
    if (previous === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = previous;
  }
});
