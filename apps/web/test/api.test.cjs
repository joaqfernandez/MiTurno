const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

let api;
const originalFetch = global.fetch;
beforeEach(() => {
  const values = new Map();
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  global.window = new EventTarget();
  const filename = path.join(__dirname, '../lib/api.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(filename, module);
  mod._compile(compiled, filename);
  api = mod.exports;
});
afterEach(() => { global.fetch = originalFetch; delete global.window; delete global.localStorage; });

for (const status of [401, 403, 404, 409, 500]) {
  test(`real error ${status} never becomes a demo success`, async () => {
    let fallback = false;
    await assert.rejects(api.withFallback(async () => { throw new api.ApiError('failure', status); }, () => { fallback = true; }), /failure/);
    assert.equal(fallback, false);
  });
}

test('explicit demo mode never calls the live API and can be exited', async () => {
  api.setDemoMode(true);
  assert.equal(await api.withFallback(() => { throw new Error('network must not be used'); }, () => 'demo'), 'demo');
  api.setDemoMode(false);
  assert.equal(await api.withFallback(async () => 'real', () => 'demo'), 'real');
});

test('expired access tokens refresh once for concurrent requests and retry with new token', async () => {
  localStorage.setItem('accessToken', 'old');
  localStorage.setItem('refreshToken', 'refresh');
  let refreshCalls = 0;
  global.fetch = async (url, init) => {
    if (url.endsWith('/auth/refresh')) {
      refreshCalls++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json({ accessToken: 'new', refreshToken: 'rotated' });
    }
    return init.headers.Authorization === 'Bearer new' ? Response.json({ ok: true }) : Response.json({}, { status: 401 });
  };
  const results = await Promise.all([api.api('/patients/me'), api.api('/appointments/me')]);
  assert.equal(refreshCalls, 1);
  assert(results.every(result => result.ok));
  assert.equal(localStorage.getItem('refreshToken'), 'rotated');
});

test('refresh server failure preserves the current session and propagates error', async () => {
  localStorage.setItem('accessToken', 'old');
  localStorage.setItem('refreshToken', 'refresh');
  global.fetch = async url => Response.json({}, { status: url.endsWith('/auth/refresh') ? 503 : 401 });
  await assert.rejects(api.api('/patients/me'), error => error.status === 503);
  assert.equal(localStorage.getItem('refreshToken'), 'refresh');
});

test('invalid refresh clears session and notifies the auth provider', async () => {
  localStorage.setItem('accessToken', 'old');
  localStorage.setItem('refreshToken', 'refresh');
  let expired = false;
  window.addEventListener('miturno:session-expired', () => { expired = true; });
  global.fetch = async () => Response.json({ detail: 'Expired' }, { status: 401 });
  await assert.rejects(api.api('/patients/me'), error => error.status === 401);
  assert.equal(localStorage.getItem('refreshToken'), null);
  assert(expired);
});

test('a refresh in flight cannot overwrite a newly selected account', async () => {
  localStorage.setItem('accessToken', 'old');
  localStorage.setItem('refreshToken', 'refresh-old');
  global.fetch = async url => {
    if (url.endsWith('/auth/refresh')) {
      localStorage.setItem('accessToken', 'other-user');
      localStorage.setItem('refreshToken', 'other-refresh');
      return Response.json({ accessToken: 'stale', refreshToken: 'stale-refresh' });
    }
    return Response.json({}, { status: 401 });
  };
  await assert.rejects(api.api('/patients/me'), error => error.status === 409);
  assert.equal(localStorage.getItem('accessToken'), 'other-user');
});

for (const status of [401, 403]) {
  test(`revoked session ${status} clears credentials without attempting refresh`, async () => {
    localStorage.setItem('accessToken', 'old');
    localStorage.setItem('refreshToken', 'refresh');
    localStorage.setItem('miturno.session', '{}');
    let calls = 0, expired = false;
    window.addEventListener('miturno:session-expired', () => { expired = true; });
    global.fetch = async () => { calls++; return Response.json({detail:'La cuenta no está activa'}, {status, headers:{'X-Session-Invalid':'1'}}); };
    await assert.rejects(api.api('/medical-records/patient'), error => error.status === status);
    assert.equal(calls, 1);
    assert.equal(localStorage.getItem('accessToken'), null);
    assert.equal(localStorage.getItem('refreshToken'), null);
    assert.equal(localStorage.getItem('miturno.session'), null);
    assert(expired);
  });
}

test('ordinary authorization denial does not terminate the session', async () => {
  localStorage.setItem('accessToken', 'valid');
  global.fetch = async () => Response.json({detail:'Sin relación asistencial'}, {status:403});
  await assert.rejects(api.api('/medical-records/other'), error => error.status === 403);
  assert.equal(localStorage.getItem('accessToken'), 'valid');
});

test('delayed suspension response does not clear a different account', async () => {
  localStorage.setItem('accessToken', 'old');
  global.fetch = async () => {
    localStorage.setItem('accessToken', 'new-account');
    return Response.json({}, {status:403, headers:{'X-Session-Invalid':'1'}});
  };
  await assert.rejects(api.api('/appointments'), error => error.status === 403);
  assert.equal(localStorage.getItem('accessToken'), 'new-account');
});

test('suspension on the retry after refresh also clears the renewed session', async () => {
  localStorage.setItem('accessToken', 'old');
  localStorage.setItem('refreshToken', 'refresh');
  global.fetch = async (url, init) => {
    if (url.endsWith('/auth/refresh')) return Response.json({accessToken:'new', refreshToken:'new-refresh'});
    if (init.headers.Authorization === 'Bearer old') return Response.json({}, {status:401});
    return Response.json({}, {status:403, headers:{'X-Session-Invalid':'1'}});
  };
  await assert.rejects(api.api('/appointments/me'), error => error.status === 403);
  assert.equal(localStorage.getItem('accessToken'), null);
  assert.equal(localStorage.getItem('refreshToken'), null);
});

test('API error codes reach the screen so it can offer the right action', async () => {
  global.fetch = async () => new Response(JSON.stringify({ message: 'Confirmá tu email para ingresar.', code: 'EMAIL_NOT_VERIFIED' }), { status: 403 });
  await assert.rejects(api.api('/auth/login', { method: 'POST' }), error => error.status === 403 && error.code === 'EMAIL_NOT_VERIFIED' && /Confirmá/.test(error.message));
  global.fetch = async () => new Response(JSON.stringify({ message: 'Credenciales inválidas' }), { status: 401 });
  await assert.rejects(api.api('/auth/login', { method: 'POST' }), error => error.status === 401 && error.code === undefined);
});
