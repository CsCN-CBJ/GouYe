import request from 'supertest';
import { app, createAuthenticatedUser, createCategory, createTag, authHeader } from './helpers.js';
import { truncateAll } from './setup.js';

let token: string;
let userId: number;
let categoryId: number;
let tagId: number;

beforeAll(async () => {
  await truncateAll();
  const user = await createAuthenticatedUser();
  token = user.token;
  userId = user.userId;
  categoryId = await createCategory(token, { category_type: 'expense' });
  tagId = await createTag(token);
});

describe('POST /api/transactions', () => {
  it('creates an expense transaction (201)', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 100,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-05-01',
        description: 'lunch',
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data.transaction_type).toBe('expense');
    expect(res.body.data.amount).toBe('100');
    expect(res.body.data.user_id).toBe(userId);
    expect(res.body.data.category_id).toBe(categoryId);
    expect(res.body.data.category).toBeDefined();
    expect(res.body.data.tags).toEqual([]);
  });

  it('creates an income transaction (201)', async () => {
    const incomeCategoryId = await createCategory(token, { category_type: 'income' });
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 5000,
        transaction_type: 'income',
        category_id: incomeCategoryId,
        transaction_date: '2026-05-02',
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data.transaction_type).toBe('income');
    expect(res.body.data.amount).toBe('5000');
  });

  it('creates transaction with tag_ids (201) and verifies tags array', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 200,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-05-03',
        tag_ids: [tagId],
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.tags)).toBe(true);
    expect(res.body.data.tags.length).toBe(1);
    expect(res.body.data.tags[0].tag_id).toBe(tagId);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({ amount: 50 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 400 for invalid transaction_type', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 50,
        transaction_type: 'invalid',
        category_id: categoryId,
        transaction_date: '2026-05-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        amount: 50,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-05-01',
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/transactions', () => {
  it('returns paginated list with default page=1, per_page=20', async () => {
    const res = await request(app)
      .get('/api/transactions')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('page');
    expect(res.body.data).toHaveProperty('per_page');
    expect(res.body.data).toHaveProperty('pages');
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.per_page).toBe(20);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('filters by transaction_type', async () => {
    const res = await request(app)
      .get('/api/transactions?type=expense')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    res.body.data.items.forEach((item: any) => {
      expect(item.transaction_type).toBe('expense');
    });
  });

  it('filters by date range (start_date, end_date)', async () => {
    const res = await request(app)
      .get('/api/transactions?start_date=2026-05-01&end_date=2026-05-03')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    res.body.data.items.forEach((item: any) => {
      const date = new Date(item.transaction_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
      expect(date >= '2026-05-01').toBe(true);
      expect(date <= '2026-05-03').toBe(true);
    });
  });

  it('filters by tag_id', async () => {
    const res = await request(app)
      .get(`/api/transactions?tag_id=${tagId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    res.body.data.items.forEach((item: any) => {
      const tagIds = item.tags.map((t: any) => t.tag_id);
      expect(tagIds).toContain(tagId);
    });
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/transactions/summary', () => {
  it('returns correct income, expense, balance values', async () => {
    const res = await request(app)
      .get('/api/transactions/summary')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    // We created at least one income (100) and one expense (50) in earlier tests
    expect(parseFloat(res.body.data.income)).toBeGreaterThan(0);
    expect(parseFloat(res.body.data.expense)).toBeGreaterThan(0);
    const balance = parseFloat(res.body.data.income) - parseFloat(res.body.data.expense);
    expect(parseFloat(res.body.data.balance)).toBeCloseTo(balance, 2);
  });

  it('supports date range filter', async () => {
    const res = await request(app)
      .get('/api/transactions/summary?start_date=2026-05-01&end_date=2026-05-01')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('income');
    expect(res.body.data).toHaveProperty('expense');
    expect(res.body.data).toHaveProperty('balance');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/transactions/summary');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/transactions/:id', () => {
  let transactionId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 88,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-05-10',
        description: 'coffee',
      });
    transactionId = res.body.data.transaction_id;
  });

  it('returns transaction by id (200)', async () => {
    const res = await request(app)
      .get(`/api/transactions/${transactionId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.transaction_id).toBe(transactionId);
    expect(res.body.data.description).toBe('coffee');
    expect(res.body.data.category).toBeDefined();
    expect(Array.isArray(res.body.data.tags)).toBe(true);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .get('/api/transactions/999999')
      .set(authHeader(token));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });
});

describe('PUT /api/transactions/:id', () => {
  let transactionId: number;
  let extraTagId: number;

  beforeAll(async () => {
    extraTagId = await createTag(token);
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 300,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-05-15',
      });
    transactionId = res.body.data.transaction_id;
  });

  it('updates amount (200)', async () => {
    const res = await request(app)
      .put(`/api/transactions/${transactionId}`)
      .set(authHeader(token))
      .send({ amount: 450 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.amount).toBe('450');
  });

  it('updates tags (200)', async () => {
    const res = await request(app)
      .put(`/api/transactions/${transactionId}`)
      .set(authHeader(token))
      .send({ tag_ids: [extraTagId] });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const tagIds = res.body.data.tags.map((t: any) => t.tag_id);
    expect(tagIds).toContain(extraTagId);
  });
});

describe('DELETE /api/transactions/:id', () => {
  it('deletes transaction (200)', async () => {
    const createRes = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 10,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-05-20',
      });
    const id = createRes.body.data.transaction_id;

    const res = await request(app)
      .delete(`/api/transactions/${id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .delete('/api/transactions/999999')
      .set(authHeader(token));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });
});

// ─── DateTime TZ (v1.10.3) ──────────────────────────────────────────────────

describe('DateTime TZ — transaction_date (v1.10.3)', () => {
  it('T6: bare transaction_date sent as local time → stored as correct UTC', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader(token))
      .send({
        amount: 999,
        transaction_type: 'expense',
        category_id: categoryId,
        transaction_date: '2026-06-18T22:00:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.transaction_date).toBe('2026-06-18T14:00:00.000Z');
  });

  it('T7: date range query hits records across Beijing time day boundary', async () => {
    // Create 3 records at different Beijing times on 2026-06-18
    // Beijing 0:00   → UTC 2026-06-17T16:00:00.000Z
    // Beijing 12:00  → UTC 2026-06-18T04:00:00.000Z
    // Beijing 23:30  → UTC 2026-06-18T15:30:00.000Z
    const times = [
      '2026-06-18T00:00:00',
      '2026-06-18T12:00:00',
      '2026-06-18T23:30:00',
    ];

    for (const t of times) {
      const r = await request(app)
        .post('/api/transactions')
        .set(authHeader(token))
        .send({
          amount: 777,
          transaction_type: 'expense',
          category_id: categoryId,
          transaction_date: t,
        });
      expect(r.status).toBe(201);
    }

    // Query by date range 2026-06-18 → should hit all 3
    const res = await request(app)
      .get('/api/transactions?start_date=2026-06-18&end_date=2026-06-18')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const matching = res.body.data.items.filter(
      (item: any) => Number(item.amount) === 777,
    );
    expect(matching.length).toBe(3);
  });
});

// ─── keyword + 未知参数白名单 (v1.11.0) ──────────────────────────────────────

describe('GET /api/transactions — keyword + 未知参数白名单 (v1.11.0)', () => {
  beforeAll(async () => {
    // T1, T2, T2b: 3 transactions with different descriptions
    const descriptions = ['抽纸 100 包', '打车回家', null];
    for (const desc of descriptions) {
      const res = await request(app)
        .post('/api/transactions')
        .set(authHeader(token))
        .send({
          amount: 100,
          transaction_type: 'expense',
          category_id: categoryId,
          transaction_date: '2026-05-01',
          description: desc,
        });
      expect(res.status).toBe(201);
    }

    // T5: 2 transactions with '%' and similar chars in description
    for (const desc of ['100%', '100块']) {
      const res = await request(app)
        .post('/api/transactions')
        .set(authHeader(token))
        .send({
          amount: 100,
          transaction_type: 'expense',
          category_id: categoryId,
          transaction_date: '2026-05-01',
          description: desc,
        });
      expect(res.status).toBe(201);
    }
  });

  it('T1: keyword 模糊匹配 description', async () => {
    const res = await request(app)
      .get('/api/transactions?keyword=抽纸')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].description).toBe('抽纸 100 包');
  });

  it('T2: keyword=三个空格等同不传', async () => {
    const res = await request(app)
      .get('/api/transactions?keyword=   ')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const descs = res.body.data.items.map((i: any) => i.description);
    expect(descs).toContain('抽纸 100 包');
    expect(descs).toContain('打车回家');
    expect(descs).toContain(null);
  });

  it('T2b: keyword=一个空格等同不传', async () => {
    const res = await request(app)
      .get('/api/transactions?keyword= ')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const descs = res.body.data.items.map((i: any) => i.description);
    expect(descs).toContain('抽纸 100 包');
    expect(descs).toContain('打车回家');
    expect(descs).toContain(null);
  });

  it('T3: 未知参数 limit 返回 400', async () => {
    const res = await request(app)
      .get('/api/transactions?limit=10')
      .set(authHeader(token));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('limit');
  });

  it('T4: 多个未知参数报错同时列出', async () => {
    const res = await request(app)
      .get('/api/transactions?keyword=x&foo=1&bar=2')
      .set(authHeader(token));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('foo');
    expect(res.body.message).toContain('bar');
  });

  it('T5: keyword=% 字面量匹配（URL 编码）', async () => {
    const res = await request(app)
      .get('/api/transactions?keyword=100%25')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.items[0].description).toBe('100%');
  });
});
