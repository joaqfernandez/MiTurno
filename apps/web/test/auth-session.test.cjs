const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.join(__dirname, '../lib/auth-session.ts');
const mod = new Module(filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { sessionFromAuth } = mod.exports;
for (const role of ['PATIENT', 'DOCTOR', 'ADMIN']) {
  test(`Google and password session preserve ${role} identity and refresh`, () => {
    const session = sessionFromAuth({ accessToken: 'access', refreshToken: 'refresh', user: { email: 'test@example.com', roles: [role], patientProfileId: role === 'PATIENT' ? 'patient-id' : null } });
    assert.equal(session.role, role);
    assert.equal(session.refreshToken, 'refresh');
    assert.equal(session.patientProfileId, role === 'PATIENT' ? 'patient-id' : undefined);
  });
}
test('inactive account cannot become a session', () => {
  assert.throws(() => sessionFromAuth({ accessToken: null, refreshToken: null, user: { email: 'test@example.com', roles: ['DOCTOR'] } }));
});
