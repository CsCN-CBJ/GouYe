import request from 'supertest';
import { app, createAuthenticatedUser, createCheckinTemplate, authHeader } from './helpers.js';
import { truncateAll } from './setup.js';

describe('Checkin API', () => {
  let token: string;
  let templateId: number;

  const templateSchema = [
    { key: 'distance', type: 'number', required: true },
    { key: 'feeling', type: 'select', required: false, options: ['good', 'ok', 'bad'] },
    { key: 'note', type: 'text', required: false },
  ];

  const validPayload = { distance: 5.5, feeling: 'good' };

  beforeAll(async () => {
    await truncateAll();
    ({ token } = await createAuthenticatedUser());
    templateId = await createCheckinTemplate(token, {
      name: 'Run Tracker',
      fields_schema: templateSchema,
    });
  });

  // ─── POST /api/checkins ──────────────────────────────────────────────────────

  describe('POST /api/checkins', () => {
    it('creates a checkin with valid payload (200)', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.template_id).toBe(templateId);
      expect(res.body.data.payload).toMatchObject(validPayload);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('user_id');
      expect(res.body.data).toHaveProperty('occurred_at');
      expect(res.body.data).toHaveProperty('created_at');
      expect(res.body.data).toHaveProperty('updated_at');
      expect(res.body.data.template).not.toBeNull();
      expect(res.body.data.template.id).toBe(templateId);
      expect(Array.isArray(res.body.data.tags)).toBe(true);
    });

    it('returns 400 when template_id is missing', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ payload: validPayload });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('returns 404 "template not found or no permission" when template is not found', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: 99999, payload: validPayload });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('template not found or no permission');
    });

    it('returns 400 containing "is required" when required field is missing from payload', async () => {
      // `distance` is required but omitted here
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: { feeling: 'good' } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('is required');
    });

    it('returns 400 containing "unknown field" for an unrecognised field in payload', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: { distance: 3, ghost_field: 'oops' } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('unknown field');
    });

    it('returns 400 containing "must be a number" when a number field receives a string', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: { distance: 'not-a-number' } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('must be a number');
    });

    it('returns 400 containing "value not in options" when select value is outside allowed options', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: { distance: 3, feeling: 'excellent' } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('value not in options');
    });
  });

  // ─── GET /api/checkins ───────────────────────────────────────────────────────

  describe('GET /api/checkins', () => {
    beforeAll(async () => {
      // Ensure at least one checkin exists for list tests
      await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload });
    });

    it('lists all checkins (200, array)', async () => {
      const res = await request(app)
        .get('/api/checkins')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('filters by template_id', async () => {
      const res = await request(app)
        .get(`/api/checkins?template_id=${templateId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((c: any) => c.template_id === templateId)).toBe(true);
    });
  });

  // ─── 未知参数白名单 (v1.11.0) ────────────────────────────────────────────────

  describe('GET /api/checkins — 未知参数白名单 (v1.11.0)', () => {
    it('T3: 未知参数 limit=10 返回 400', async () => {
      const res = await request(app)
        .get('/api/checkins?limit=10')
        .set(authHeader(token));

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('limit');
    });
  });

  // ─── GET /api/checkins/:id ───────────────────────────────────────────────────

  describe('GET /api/checkins/:id', () => {
    let checkinId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload });
      checkinId = res.body.data.id;
    });

    it('returns checkin by id (200)', async () => {
      const res = await request(app)
        .get(`/api/checkins/${checkinId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(checkinId);
      expect(res.body.data.template_id).toBe(templateId);
      expect(res.body.data.template).not.toBeNull();
    });

    it('returns 404 for non-existent checkin', async () => {
      const res = await request(app)
        .get('/api/checkins/99999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });
  });

  // ─── PUT /api/checkins/:id ───────────────────────────────────────────────────

  describe('PUT /api/checkins/:id', () => {
    let checkinId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload });
      checkinId = res.body.data.id;
    });

    it('updates payload (200)', async () => {
      const newPayload = { distance: 10, feeling: 'ok', note: 'Long run' };
      const res = await request(app)
        .put(`/api/checkins/${checkinId}`)
        .set(authHeader(token))
        .send({ payload: newPayload });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.payload).toMatchObject(newPayload);
    });

    it('rejects invalid payload update (400)', async () => {
      const res = await request(app)
        .put(`/api/checkins/${checkinId}`)
        .set(authHeader(token))
        .send({ payload: { distance: 'not-a-number' } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });
  });

  // ─── DELETE /api/checkins/:id ────────────────────────────────────────────────

  describe('DELETE /api/checkins/:id', () => {
    it('deletes a checkin (200)', async () => {
      const createRes = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload });
      const id = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/checkins/${id}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('returns 404 when deleting non-existent checkin', async () => {
      const res = await request(app)
        .delete('/api/checkins/99999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });
  });

  // ─── Auth ────────────────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/checkins');
      expect(res.status).toBe(401);
    });
  });

  // ─── DateTime TZ (v1.10.3) ──────────────────────────────────────────────────

  describe('DateTime TZ — occurred_at (v1.10.3)', () => {
    it('T1: bare occurred_at sent as local time → stored as correct UTC', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload, occurred_at: '2026-06-18T22:00:00' });

      expect(res.status).toBe(200);
      const id = res.body.data.id;

      const getRes = await request(app)
        .get(`/api/checkins/${id}`)
        .set(authHeader(token));
      expect(getRes.body.data.occurred_at).toBe('2026-06-18T14:00:00.000Z');
    });

    it('T2: occurred_at with Z suffix → stored as-is', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload, occurred_at: '2026-06-18T14:00:00Z' });

      expect(res.status).toBe(200);
      const id = res.body.data.id;

      const getRes = await request(app)
        .get(`/api/checkins/${id}`)
        .set(authHeader(token));
      expect(getRes.body.data.occurred_at).toBe('2026-06-18T14:00:00.000Z');
    });

    it('T3: occurred_at with +08:00 offset → stored as correct UTC', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload, occurred_at: '2026-06-18T22:00:00+08:00' });

      expect(res.status).toBe(200);
      const id = res.body.data.id;

      const getRes = await request(app)
        .get(`/api/checkins/${id}`)
        .set(authHeader(token));
      expect(getRes.body.data.occurred_at).toBe('2026-06-18T14:00:00.000Z');
    });

    it('T4: no occurred_at → server sets it close to now', async () => {
      const before = Date.now();
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload });
      const after = Date.now();

      expect(res.status).toBe(200);
      const id = res.body.data.id;

      const getRes = await request(app)
        .get(`/api/checkins/${id}`)
        .set(authHeader(token));
      const occurredAt = new Date(getRes.body.data.occurred_at).getTime();
      expect(occurredAt).toBeGreaterThanOrEqual(before - 5000);
      expect(occurredAt).toBeLessThanOrEqual(after + 5000);
    });

    it('T5: invalid occurred_at string → 400', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({ template_id: templateId, payload: validPayload, occurred_at: 'not-a-date' });

      expect(res.status).toBe(400);
    });
  });

  // ─── E1-E3: Array field (v1.9) ───────────────────────────────────────────────

  describe('Checkin array field (v1.9)', () => {
    let token: string;
    let fitnessTemplateId: number;

    const fitnessTemplate = {
      fields: [
        {
          key: 'exercises',
          type: 'array',
          label: '动作',
          required: true,
          min_items: 1,
          item_fields: [
            { key: 'name', type: 'text', label: '动作名', required: true },
            { key: 'equipment', type: 'select', options: ['哑铃', '杠铃', '固定器械', '自重', '其他'] },
            {
              key: 'sets',
              type: 'array',
              label: '组',
              required: true,
              min_items: 1,
              item_fields: [
                { key: 'weight_kg', type: 'number', label: '重量(kg)' },
                { key: 'reps', type: 'number', label: '次数', required: true },
                { key: 'rpe', type: 'number', label: 'RPE', required: false },
              ],
            },
          ],
        },
      ],
    };

    const fitnessPayload = {
      exercises: [
        {
          name: '哑铃卧推',
          equipment: '哑铃',
          sets: [
            { weight_kg: 20, reps: 12 },
            { weight_kg: 22.5, reps: 10 },
            { weight_kg: 25, reps: 8 },
          ],
        },
        {
          name: '上斜卧推',
          equipment: '杠铃',
          sets: [
            { weight_kg: 40, reps: 10 },
            { weight_kg: 50, reps: 8 },
          ],
        },
      ],
    };

    beforeAll(async () => {
      ({ token } = await createAuthenticatedUser());

      // Create fitness template upfront so E2/E3 are independent of E1's result
      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({
          name: `Fitness Template ${Date.now()}`,
          fields_schema: fitnessTemplate,
        });
      fitnessTemplateId = res.body.data.id;
    });

    it('E1: POST /checkin-templates creates fitness template (201)', async () => {
      const res = await request(app)
        .post('/api/checkin-templates')
        .set(authHeader(token))
        .send({
          name: `Fitness Template 2 ${Date.now()}`,
          fields_schema: fitnessTemplate,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
      // fields_schema preserved as-is (with comment injected)
      const fs = res.body.data.fields_schema;
      const fields = fs && (Array.isArray(fs) ? fs : fs.fields ?? []);
      const exercisesField = fields.find((f: any) => f.key === 'exercises');
      expect(exercisesField).toBeDefined();
      expect(exercisesField.type).toBe('array');
      expect(exercisesField.item_fields).toBeDefined();
    });

    it('E2: POST /checkins full fitness payload (201)', async () => {
      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({
          template_id: fitnessTemplateId,
          payload: fitnessPayload,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.payload).toMatchObject(fitnessPayload);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.template_id).toBe(fitnessTemplateId);
    });

    it('E3: POST /checkins missing one set reps → 400 with path', async () => {
      const badPayload = {
        exercises: [
          {
            name: '哑铃卧推',
            sets: [
              { weight_kg: 20, reps: 12 },
              { weight_kg: 22.5 }, // missing reps (required field)
            ],
          },
        ],
      };

      const res = await request(app)
        .post('/api/checkins')
        .set(authHeader(token))
        .send({
          template_id: fitnessTemplateId,
          payload: badPayload,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toContain('exercises[0].sets[1].reps: is required');
    });
  });
});
