import request from 'supertest';
import prisma from '../src/prisma.js';
import { app, authHeader, createAuthenticatedUser } from './helpers.js';
import { truncateAll } from './setup.js';

const endpoint = '/api/app-usage/devices/test-phone/days/2026-11-22';
const original = {
  package_name: 'com.example.reader',
  app_name: '阅读',
  started_at: '2026-11-22T23:58:00.123+08:00',
  ended_at: '2026-11-23T00:00:00.000+08:00',
};
let token: string;

beforeEach(async () => {
  await truncateAll();
  token = (await createAuthenticatedUser()).token;
});

function put(revision: number, sessions = [original]) {
  return request(app).put(endpoint).set(authHeader(token)).send({ revision, sessions });
}

describe('app usage sync', () => {
  it('keeps the date, millisecond precision and Beijing offset across a sync', async () => {
    const committed = await put(1);
    expect(committed.status).toBe(200);
    expect(committed.body.data).toMatchObject({ status: 'applied', revision: 1, duration_ms: 119877 });
    const response = await request(app).get(endpoint).set(authHeader(token));
    expect(response.body.data.sessions).toEqual([{ ...original, duration_ms: 119877 }]);
    expect(response.body.data.apps[0].duration_ms).toBe(119877);
    const raw = await prisma.$queryRaw<Array<{ kind: string }>>`SELECT typeof(started_at) AS kind FROM app_usage_sessions`;
    expect(raw).toEqual([{ kind: 'integer' }]);
  });

  it('treats retries as duplicates and preserves a newer version after an outdated upload', async () => {
    expect((await put(1)).body.data.status).toBe('applied');
    expect((await put(1)).body.data.status).toBe('duplicate');
    const replacement = { ...original, app_name: '新版名称', started_at: '2026-11-22T23:57:00.000+08:00' };
    expect((await put(2, [replacement])).body.data.status).toBe('applied');
    expect((await put(1)).body.data.status).toBe('stale');
    expect((await put(2)).status).toBe(409);
    const response = await request(app).get(endpoint).set(authHeader(token));
    expect(response.body.data.sessions).toEqual([{ ...replacement, duration_ms: 180000 }]);
  });

  it('validates a full day before changing existing rows and scopes reads to the account', async () => {
    await put(1);
    expect((await put(2, [{ ...original, ended_at: '2026-11-23T00:00:00.010+08:00' }])).status).toBe(400);
    expect((await put(2, [original, original])).status).toBe(400);
    expect((await put(2, [])).status).toBe(400);
    expect((await request(app).get(endpoint)).status).toBe(401);
    const other = await createAuthenticatedUser();
    expect((await request(app).get(endpoint).set(authHeader(other.token))).status).toBe(404);
    const response = await request(app).get('/api/app-usage/days?from=2026-11-22&to=2026-11-22')
      .set(authHeader(token));
    expect(response.body.data.map((row: { revision: number }) => row.revision)).toEqual([1]);
  });

  it('rolls back the day and its previous segments if the replacement fails', async () => {
    await put(1);
    await prisma.$executeRaw`CREATE TRIGGER fail_app_usage_insert BEFORE INSERT ON app_usage_sessions
      WHEN NEW.package_name = 'test.fail' BEGIN SELECT RAISE(ABORT, 'test rollback'); END`;
    try {
      expect((await put(2, [{ ...original, package_name: 'test.fail' }])).status).toBe(500);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER fail_app_usage_insert`;
    }
    const response = await request(app).get(endpoint).set(authHeader(token));
    expect(response.body.data.revision).toBe(1);
    expect(response.body.data.sessions).toEqual([{ ...original, duration_ms: 119877 }]);
  });
});
