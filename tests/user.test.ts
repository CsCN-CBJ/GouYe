import request from 'supertest';
import { app, createAuthenticatedUser } from './helpers.js';
import { truncateAll } from './setup.js';

beforeAll(truncateAll);

describe('POST /api/users/register', () => {
  it('registers a new user successfully', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ username: 'alice', password: 'Secret123!' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({ username: 'alice' });
    expect(typeof res.body.data.user_id).toBe('number');
    expect(typeof res.body.data.created_at).toBe('string');
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ username: 'bob' }); // no password

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 409 when username already exists', async () => {
    await request(app)
      .post('/api/users/register')
      .send({ username: 'charlie', password: 'pass1' });

    const res = await request(app)
      .post('/api/users/register')
      .send({ username: 'charlie', password: 'pass2' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(1);
  });
});

describe('POST /api/users/login', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/users/register')
      .send({ username: 'loginuser', password: 'MyPass99!' });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({ username: 'loginuser', password: 'MyPass99!' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token.length).toBeGreaterThan(0);
    expect(res.body.data.user).toMatchObject({ username: 'loginuser' });
    expect(typeof res.body.data.user.user_id).toBe('number');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({ username: 'loginuser', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 for nonexistent user', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({ username: 'nobody_xyz', password: 'anypass' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});

describe('GET /api/users/me', () => {
  let token: string;

  beforeAll(async () => {
    const user = await createAuthenticatedUser('meuser');
    token = user.token;
  });

  it('returns current user with valid token', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({ username: 'meuser' });
    expect(typeof res.body.data.user_id).toBe('number');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer thisisnotavalidtoken');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});
