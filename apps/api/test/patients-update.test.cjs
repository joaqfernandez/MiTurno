const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');

// Real Nest HTTP routing, JWT guard, DTO validation and service; only DB is replaced.
process.env.JWT_ACCESS_SECRET = 'patient-update-test-secret-not-for-production';
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { PatientsController } = require('../src/modules/patients/patients.controller');
const { PatientsService } = require('../src/modules/patients/patients.service');
const { PrismaService } = require('../src/prisma/prisma.service');
const { JwtStrategy } = require('../src/modules/auth/strategies/jwt.strategy');

let app, base, profile, calls;
const initial = {
  id: 'patient-own', userId: 'user-own', firstName: 'Ana', lastName: 'Castro',
  documentId: '12345678', birthDate: new Date('1990-01-01'),
  healthInsurance: 'Original', insuranceNumber: 'ABC',
};
const prisma = {
  patientProfile: {
    update: async args => {
      calls.push(args);
      assert.deepEqual(args.where, { id: 'patient-own' });
      for (const [key, value] of Object.entries(args.data)) {
        if (value !== undefined) profile[key] = value;
      }
      return profile;
    },
  },
};
class TestModule {}
Module({
  controllers: [PatientsController],
  providers: [PatientsService, JwtStrategy, { provide: PrismaService, useValue: prisma }],
})(TestModule);
const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
const token = jwt.sign({ sub: 'user-own', email: 'patient@example.com', roles: ['PATIENT'], pid: 'patient-own' });

before(async () => {
  app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => { if (app) await app.close(); });
beforeEach(() => { profile = { ...initial }; calls = []; });

async function patch(body, bearer = token) {
  const response = await fetch(`${base}/api/patients/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('updates all six allowed fields on the authenticated patient', async () => {
  const changes = { firstName: 'Juana', lastName: 'Pérez', documentId: '87654321', birthDate: '2000-02-29', healthInsurance: 'Nueva', insuranceNumber: 'XYZ' };
  const result = await patch(changes);
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { where: { id: 'patient-own' }, data: { ...changes, birthDate: new Date(changes.birthDate) } });
  assert.equal(result.body.id, 'patient-own');
  assert.equal(result.body.userId, 'user-own');
  assert.equal(result.body.birthDate, '2000-02-29T00:00:00.000Z');
});

test('partial updates preserve omitted fields', async () => {
  assert.equal((await patch({ firstName: 'Juana' })).status, 200);
  assert.deepEqual(profile, { ...initial, firstName: 'Juana' });
});

test('empty patch leaves the profile unchanged', async () => {
  assert.equal((await patch({})).status, 200);
  assert.deepEqual(profile, initial);
});

const forbidden = {
  roles: ['ADMIN'], status: 'ACTIVE', id: 'patient-other', userId: 'user-other',
  user: { update: { roles: ['ADMIN'], status: 'ACTIVE', passwordHash: 'replacement' } },
  appointments: { deleteMany: {} }, medicalRecord: { delete: true },
  createdAt: '2000-01-01', updatedAt: '2000-01-01',
  passwordHash: 'replacement', unknown: 'value',
};
for (const [field, value] of Object.entries(forbidden)) {
  test(`rejects unauthorized field ${field} before any persistence`, async () => {
    const result = await patch({ firstName: 'Must not persist', [field]: value });
    assert.equal(result.status, 400);
    assert(result.body.message.some(message => message.includes(`property ${field} should not exist`)));
    assert.equal(calls.length, 0);
    assert.deepEqual(profile, initial);
  });
}

for (const field of ['firstName', 'lastName', 'documentId', 'birthDate', 'healthInsurance', 'insuranceNumber']) {
  for (const value of [null, 123, [], { set: 'injected' }]) {
    test(`rejects invalid ${field}: ${JSON.stringify(value)}`, async () => {
      assert.equal((await patch({ [field]: value })).status, 400);
      assert.equal(calls.length, 0);
      assert.deepEqual(profile, initial);
    });
  }
}

for (const birthDate of ['not-a-date', '2025-02-30', '2025-13-01', '2025-01-01T00:00:00Z', '']) {
  test(`rejects invalid date-only birthDate ${JSON.stringify(birthDate)}`, async () => {
    assert.equal((await patch({ birthDate })).status, 400);
    assert.equal(calls.length, 0);
  });
}
for (const field of ['firstName', 'lastName']) {
  test(`rejects empty ${field}`, async () => {
    assert.equal((await patch({ [field]: '' })).status, 400);
    assert.equal(calls.length, 0);
  });
}

for (const [label, bearer] of [['missing', null], ['invalid', 'invalid-token'], ['expired', jwt.sign({ sub: 'user-own', pid: 'patient-own' }, { expiresIn: -1 })]]) {
  test(`rejects ${label} JWT`, async () => {
    assert.equal((await patch({ firstName: 'Juana' }, bearer)).status, 401);
    assert.equal(calls.length, 0);
  });
}

test('rejects authenticated user without a patient profile', async () => {
  const doctorToken = jwt.sign({ sub: 'doctor-user', roles: ['DOCTOR'], did: 'doctor-own' });
  assert.equal((await patch({ firstName: 'Juana' }, doctorToken)).status, 403);
  assert.equal(calls.length, 0);
});

test('service allowlist drops privileged fields even if an internal caller bypasses DTO validation', async () => {
  const service = new PatientsService(prisma);
  await service.updateMe({ patientProfileId: 'patient-own' }, { firstName: 'Juana', ...forbidden });
  const defined = Object.fromEntries(Object.entries(calls[0].data).filter(([, value]) => value !== undefined));
  assert.deepEqual(defined, { firstName: 'Juana' });
  assert.deepEqual(profile, { ...initial, firstName: 'Juana' });
});

test('service refuses calls without patient ownership before touching Prisma', async () => {
  const service = new PatientsService(prisma);
  await assert.rejects(service.updateMe({}, { firstName: 'Juana' }), error => error.getStatus() === 403);
  assert.equal(calls.length, 0);
});
