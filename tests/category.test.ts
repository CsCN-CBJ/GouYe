import request from 'supertest';
import { app, createAuthenticatedUser, createCategory, authHeader } from './helpers.js';
import { truncateAll } from './setup.js';

beforeAll(truncateAll);

// ─── POST /api/categories ─────────────────────────────────────────────────────

describe('POST /api/categories', () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
  });

  it('creates an expense category and returns 200', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set(authHeader(token))
      .send({ category_name: '餐饮', category_type: 'expense' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      category_name: '餐饮',
      category_type: 'expense',
    });
    expect(typeof res.body.data.category_id).toBe('number');
  });

  it('creates an income category and returns 200', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set(authHeader(token))
      .send({ category_name: '工资', category_type: 'income' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      category_name: '工资',
      category_type: 'income',
    });
  });

  it('returns 400 when category_name is missing', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set(authHeader(token))
      .send({ category_type: 'expense' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 400 when category_type is missing', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set(authHeader(token))
      .send({ category_name: '购物' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 400 when category_type is invalid', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set(authHeader(token))
      .send({ category_name: '购物', category_type: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ category_name: '购物', category_type: 'expense' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});

// ─── GET /api/categories ──────────────────────────────────────────────────────

describe('GET /api/categories', () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
    await createCategory(token, { category_name: '交通', category_type: 'expense' });
    await createCategory(token, { category_name: '兼职', category_type: 'income' });
  });

  it('returns 200 with the user\'s categories', async () => {
    const res = await request(app)
      .get('/api/categories')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);

    const names = res.body.data.map((c: any) => c.category_name);
    expect(names).toContain('交通');
    expect(names).toContain('兼职');
  });

  it('filters by type=expense', async () => {
    const res = await request(app)
      .get('/api/categories?type=expense')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    for (const cat of res.body.data) {
      expect(cat.category_type).toBe('expense');
    }
  });

  it('filters by type=income', async () => {
    const res = await request(app)
      .get('/api/categories?type=income')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    for (const cat of res.body.data) {
      expect(cat.category_type).toBe('income');
    }
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});

// ─── keyword + 未知参数白名单 (v1.11.0) ──────────────────────────────────────

describe('GET /api/categories — keyword + 未知参数白名单 (v1.11.0)', () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
    await createCategory(token, { category_name: '周报分类', category_type: 'expense' });
    await createCategory(token, { category_name: '其他分类', category_type: 'income' });
    await createCategory(token, { category_name: '100%类型', category_type: 'expense' });
  });

  it('T1: keyword=周报 命中 categoryName', async () => {
    const res = await request(app)
      .get('/api/categories?keyword=周报')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].category_name).toBe('周报分类');
  });

  it('T2: keyword=空白 不过滤', async () => {
    const res = await request(app)
      .get('/api/categories?keyword=   ')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const names = res.body.data.map((c: any) => c.category_name);
    expect(names).toContain('周报分类');
    expect(names).toContain('其他分类');
  });

  it('T3: 未知参数 limit=10 返回 400', async () => {
    const res = await request(app)
      .get('/api/categories?limit=10')
      .set(authHeader(token));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('limit');
  });

  it('T4: keyword=100% 字面量匹配', async () => {
    const res = await request(app)
      .get('/api/categories?keyword=100%25')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].category_name).toBe('100%类型');
  });
});

// ─── PUT /api/categories/:id ──────────────────────────────────────────────────

describe('PUT /api/categories/:categoryId', () => {
  let token: string;
  let categoryId: number;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
    categoryId = await createCategory(token, { category_name: '娱乐', category_type: 'expense' });
  });

  it('updates the category name and returns 200', async () => {
    const res = await request(app)
      .put(`/api/categories/${categoryId}`)
      .set(authHeader(token))
      .send({ category_name: '娱乐消费' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.category_name).toBe('娱乐消费');
    expect(res.body.data.category_id).toBe(categoryId);
  });

  it('returns 404 for a nonexistent category', async () => {
    const res = await request(app)
      .put('/api/categories/999999')
      .set(authHeader(token))
      .send({ category_name: '不存在' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('C1: PUT another user category returns 403', async () => {
    const { token: otherToken } = await createAuthenticatedUser();
    const id = await createCategory(token, { category_name: 'cross-put', category_type: 'expense' });
    const res = await request(app).put(`/api/categories/${id}`).set(authHeader(otherToken)).send({ category_name: 'hack' });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('cannot modify public category');
  });

  it('C2: DELETE another user category returns 403', async () => {
    const { token: otherToken } = await createAuthenticatedUser();
    const id = await createCategory(token, { category_name: 'cross-del', category_type: 'expense' });
    const res = await request(app).delete(`/api/categories/${id}`).set(authHeader(otherToken));
    expect(res.status).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .put(`/api/categories/${categoryId}`)
      .send({ category_name: '无凭证' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});

// ─── DELETE /api/categories/:id ───────────────────────────────────────────────

describe('DELETE /api/categories/:categoryId', () => {
  let token: string;

  beforeAll(async () => {
    ({ token } = await createAuthenticatedUser());
  });

  it('deletes a category and returns 200', async () => {
    const categoryId = await createCategory(token, { category_name: '待删除', category_type: 'expense' });

    const res = await request(app)
      .delete(`/api/categories/${categoryId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('returns 404 for a nonexistent category', async () => {
    const res = await request(app)
      .delete('/api/categories/999999')
      .set(authHeader(token));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('returns 409 when the category has associated transactions', async () => {
    const categoryId = await createCategory(token, { category_name: '有交易', category_type: 'expense' });

    // Create a transaction linked to this category
    await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 50,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-05-01',
      });

    const res = await request(app)
      .delete(`/api/categories/${categoryId}`)
      .set(authHeader(token));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 when no token is provided', async () => {
    const categoryId = await createCategory(token, { category_name: '无凭证分类', category_type: 'expense' });

    const res = await request(app).delete(`/api/categories/${categoryId}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1);
  });
});
