import request from 'supertest';
import { app, createAuthenticatedUser, createTag, authHeader } from './helpers.js';
import { truncateAll } from './setup.js';

beforeAll(truncateAll);

// ─── POST /api/tags ───────────────────────────────────────────────────────────

describe('POST /api/tags', () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
  });

  it('creates a tag and returns 201 with message "created"', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set(authHeader(token))
      .send({ tag_name: '健身' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('created');
    expect(res.body.data).toMatchObject({ tag_name: '健身' });
    expect(typeof res.body.data.tag_id).toBe('number');
  });

  it('returns 400 when tag_name is missing', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 409 when the same user creates a duplicate tag name', async () => {
    await request(app)
      .post('/api/tags')
      .set(authHeader(token))
      .send({ tag_name: '重复标签' });

    const res = await request(app)
      .post('/api/tags')
      .set(authHeader(token))
      .send({ tag_name: '重复标签' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(1);
  });

  it('allows two different users to create tags with the same name', async () => {
    const { token: tokenA } = await createAuthenticatedUser();
    const { token: tokenB } = await createAuthenticatedUser();

    const resA = await request(app)
      .post('/api/tags')
      .set(authHeader(tokenA))
      .send({ tag_name: '共同标签名' });

    const resB = await request(app)
      .post('/api/tags')
      .set(authHeader(tokenB))
      .send({ tag_name: '共同标签名' });

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/api/tags')
      .send({ tag_name: '无凭证' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});

// ─── GET /api/tags ────────────────────────────────────────────────────────────

describe('GET /api/tags', () => {
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    ({ token: tokenA } = await createAuthenticatedUser());
    ({ token: tokenB } = await createAuthenticatedUser());

    await createTag(tokenA, '用户A的标签');
    await createTag(tokenB, '用户B的标签');
  });

  it('returns only the authenticated user\'s own tags', async () => {
    const res = await request(app)
      .get('/api/tags')
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);

    const names = res.body.data.map((t: any) => t.tag_name);
    expect(names).toContain('用户A的标签');
    expect(names).not.toContain('用户B的标签');
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/tags');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});

// ─── keyword + 未知参数白名单 (v1.11.0) ──────────────────────────────────────

describe('GET /api/tags — keyword + 未知参数白名单 (v1.11.0)', () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
    await createTag(token, '周报标签');
    await createTag(token, '其他标签');
    await createTag(token, '100%标签');
  });

  it('T1: keyword=周报 命中 tagName', async () => {
    const res = await request(app)
      .get('/api/tags?keyword=周报')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].tag_name).toBe('周报标签');
  });

  it('T2: keyword=空白 不过滤', async () => {
    const res = await request(app)
      .get('/api/tags?keyword=   ')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const names = res.body.data.map((t: any) => t.tag_name);
    expect(names).toContain('周报标签');
    expect(names).toContain('其他标签');
  });

  it('T3: 未知参数 foo=1 返回 400', async () => {
    const res = await request(app)
      .get('/api/tags?foo=1')
      .set(authHeader(token));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('foo');
  });

  it('T4: keyword=100% 字面量匹配', async () => {
    const res = await request(app)
      .get('/api/tags?keyword=100%25')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].tag_name).toBe('100%标签');
  });
});

// ─── PUT /api/tags/:tagId ─────────────────────────────────────────────────────

describe('PUT /api/tags/:tagId', () => {
  let token: string;
  let tagId: number;
  let otherTagId: number;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
    tagId = await createTag(token, 'update_target');
    otherTagId = await createTag(token, 'existing_name');
  });

  it('updates the tag name and returns 200', async () => {
    const res = await request(app)
      .put(`/api/tags/${tagId}`)
      .set(authHeader(token))
      .send({ tag_name: 'updated_name' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.tag_name).toBe('updated_name');
    expect(res.body.data.tag_id).toBe(tagId);
  });

  it('returns 409 when renaming to a name that already exists for the same user', async () => {
    const res = await request(app)
      .put(`/api/tags/${tagId}`)
      .set(authHeader(token))
      .send({ tag_name: 'existing_name' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(1);
  });

  it('returns 404 for a nonexistent tag', async () => {
    const res = await request(app)
      .put('/api/tags/999999')
      .set(authHeader(token))
      .send({ tag_name: '不存在' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('returns 404 when updating another user\'s tag', async () => {
    const { token: otherToken } = await createAuthenticatedUser();

    const res = await request(app)
      .put(`/api/tags/${tagId}`)
      .set(authHeader(otherToken))
      .send({ tag_name: '偷改' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .put(`/api/tags/${tagId}`)
      .send({ tag_name: '无凭证' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});

// ─── DELETE /api/tags/:tagId ──────────────────────────────────────────────────

describe('DELETE /api/tags/:tagId', () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
  });

  it('deletes a tag and returns 200 with message "deleted"', async () => {
    const tagId = await createTag(token, 'delete_me');

    const res = await request(app)
      .delete(`/api/tags/${tagId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('deleted');
  });

  it('returns 404 for a nonexistent tag', async () => {
    const res = await request(app)
      .delete('/api/tags/999999')
      .set(authHeader(token));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('returns 404 when deleting another user\'s tag', async () => {
    const { token: otherToken } = await createAuthenticatedUser();
    const tagId = await createTag(token, 'owned_by_first_user');

    const res = await request(app)
      .delete(`/api/tags/${tagId}`)
      .set(authHeader(otherToken));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 when no token is provided', async () => {
    const tagId = await createTag(token, 'no_auth_delete');

    const res = await request(app).delete(`/api/tags/${tagId}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});
