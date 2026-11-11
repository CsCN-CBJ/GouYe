import request from 'supertest';
import { app, createAuthenticatedUser, authHeader } from './helpers.js';
import { truncateAll } from './setup.js';

describe('Checkin Template API', () => {
  let token: string;

  const defaultSchema = [
    { key: 'distance', type: 'number', required: true },
    { key: 'note', type: 'text', required: false },
  ];

  const defaultSchemaWithComment = {
    fields: [
      ...defaultSchema,
      { key: 'comment', type: 'text', label: '备注', system: true, required: false, multiline: true, max_length: 500 },
    ],
  };

  beforeAll(async () => {
    await truncateAll();
    ({ token } = await createAuthenticatedUser());
  });

  // ─── POST /api/checkin-templates ─────────────────────────────────────────────

  describe('POST /api/checkin-templates', () => {
    it('creates a template with fields_schema (200)', async () => {
      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: 'Running Log', fields_schema: defaultSchema });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('Running Log');
      expect(res.body.data.fields_schema).toEqual(defaultSchemaWithComment);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('user_id');
      expect(res.body.data).toHaveProperty('created_at');
      expect(res.body.data).toHaveProperty('updated_at');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ fields_schema: defaultSchema });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('returns 400 when fields_schema is missing', async () => {
      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: 'No Schema Template' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('returns 400 when user tries to use reserved key "comment"', async () => {
      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({
          name: 'Bad Template',
          fields_schema: [{ key: 'comment', type: 'text', required: false }],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('comment is a reserved field');
    });

    it('returns 409 with "template name already exists" for duplicate name', async () => {
      const name = `Dup Template ${Date.now()}`;

      await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name, fields_schema: defaultSchema });

      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name, fields_schema: defaultSchema });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('template name already exists');
    });
  });

  // ─── GET /api/checkin-templates ──────────────────────────────────────────────

  describe('GET /api/checkin-templates', () => {
    it('lists all templates (200, array)', async () => {
      const res = await request(app)
        .get('/api/checkin-templates')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ─── GET /api/checkin-templates/:id ──────────────────────────────────────────

  describe('GET /api/checkin-templates/:id', () => {
    let templateId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: `Get Template ${Date.now()}`, fields_schema: defaultSchema });
      templateId = res.body.data.id;
    });

    it('returns template by id (200)', async () => {
      const res = await request(app)
        .get(`/api/checkin-templates/${templateId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(templateId);
      expect(res.body.data).toHaveProperty('name');
      expect(res.body.data).toHaveProperty('fields_schema');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await request(app)
        .get('/api/checkin-templates/99999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });
  });

  // ─── keyword + 未知参数白名单 (v1.11.0) ──────────────────────────────────────

  describe('GET /api/checkin-templates — keyword + 未知参数白名单 (v1.11.0)', () => {
    beforeAll(async () => {
      await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: `周报模板 ${Date.now()}`, fields_schema: defaultSchema });

      await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: `其他模板 ${Date.now()}`, fields_schema: defaultSchema });

      await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: `100%模板 ${Date.now()}`, fields_schema: defaultSchema });
    });

    it('T1: keyword=周报 命中 name', async () => {
      const res = await request(app)
        .get('/api/checkin-templates?keyword=周报')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toContain('周报模板');
    });

    it('T2: keyword=空白 不过滤', async () => {
      const res = await request(app)
        .get('/api/checkin-templates?keyword=   ')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const names = res.body.data.map((t: any) => t.name);
      expect(names.some((n: string) => n.includes('周报模板'))).toBe(true);
      expect(names.some((n: string) => n.includes('其他模板'))).toBe(true);
    });

    it('T3: 未知参数 limit=10 返回 400', async () => {
      const res = await request(app)
        .get('/api/checkin-templates?limit=10')
        .set(authHeader(token));

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('limit');
    });

    it('T4: keyword=100% 字面量匹配', async () => {
      const res = await request(app)
        .get('/api/checkin-templates?keyword=100%25')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toContain('100%模板');
    });
  });

  // ─── PUT /api/checkin-templates/:id ──────────────────────────────────────────

  describe('PUT /api/checkin-templates/:id', () => {
    let templateId: number;
    let otherTemplateName: string;

    beforeAll(async () => {
      const r1 = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: `Update Template ${Date.now()}`, fields_schema: defaultSchema });
      templateId = r1.body.data.id;

      otherTemplateName = `Other Template ${Date.now()}`;
      await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: otherTemplateName, fields_schema: defaultSchema });
    });

    it('updates name (200)', async () => {
      const newName = `Renamed Template ${Date.now()}`;
      const res = await request(app)
        .put(`/api/checkin-templates/${templateId}`)
        .set(authHeader(token))
        .send({ name: newName });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe(newName);
    });

    it('returns 409 when renaming to an existing name', async () => {
      const res = await request(app)
        .put(`/api/checkin-templates/${templateId}`)
        .set(authHeader(token))
        .send({ name: otherTemplateName });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('template name already exists');
    });

    it('updates fields_schema (200, with comment injected)', async () => {
      const newSchema = [{ key: 'weight', type: 'number', required: true }];
      const res = await request(app)
        .put(`/api/checkin-templates/${templateId}`)
        .set(authHeader(token))
        .send({ fields_schema: newSchema });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.fields_schema.fields).toEqual(
        expect.arrayContaining([
          { key: 'weight', type: 'number', required: true },
          { key: 'comment', type: 'text', label: '备注', system: true, required: false, multiline: true, max_length: 500 },
        ]),
      );
    });
  });

  // ─── DELETE /api/checkin-templates/:id ───────────────────────────────────────

  describe('DELETE /api/checkin-templates/:id', () => {
    it('deletes a template (200)', async () => {
      const createRes = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({ name: `Delete Me ${Date.now()}`, fields_schema: defaultSchema });
      const id = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/checkin-templates/${id}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('returns 404 when deleting non-existent template', async () => {
      const res = await request(app)
        .delete('/api/checkin-templates/99999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });

    it('returns 409 "cannot delete template with associated checkins" when template has checkins', async () => {
      // Create a fresh template
      const createRes = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({
          name: `Protected Template ${Date.now()}`,
          fields_schema: [{ key: 'note', type: 'text', required: false }],
        });
      const id = createRes.body.data.id;

      // Attach a checkin to the template
      await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: id });

      // Now attempt to delete — should be blocked
      const res = await request(app)
        .delete(`/api/checkin-templates/${id}`)
        .set(authHeader(token));

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('cannot delete template with associated checkins');
    });
  });

  // ─── Auth ────────────────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/checkin-templates');
      expect(res.status).toBe(401);
    });
  });
});
