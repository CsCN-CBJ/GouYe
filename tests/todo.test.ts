import request from 'supertest';
import { app, createAuthenticatedUser, createTag, authHeader } from './helpers.js';
import { truncateAll } from './setup.js';

describe('Todo API', () => {
  let token: string;
  let userId: number;
  let tagId: number;
  let projectId: number;

  beforeAll(async () => {
    await truncateAll();
    ({ token, userId } = await createAuthenticatedUser());
    tagId = await createTag(token);
    // project route returns project_id (not id), so create directly
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Test Project', domain: 'work' });
    projectId = projRes.body.data.project_id;
  });

  // ─── POST /api/todos ────────────────────────────────────────────────────────

  describe('POST /api/todos', () => {
    it('creates a todo with required fields (201, status=pending, current_version=1)', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'My first todo', domain: 'work' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.title).toBe('My first todo');
      expect(res.body.data.domain).toBe('work');
      expect(res.body.data.status).toBe('not_started');
      expect(res.body.data.current_version).toBe(1);
      expect(res.body.data.user_id).toBe(userId);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('created_at');
      expect(res.body.data).toHaveProperty('updated_at');
      expect(Array.isArray(res.body.data.tags)).toBe(true);
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ domain: 'work' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('returns 400 when domain is missing', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'No domain' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('returns 400 for invalid domain value', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Bad domain', domain: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
    });

    it('creates todo with project_id (201, project_id populated)', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Project todo', domain: 'work', project_id: projectId });

      expect(res.status).toBe(201);
      expect(res.body.data.project_id).toBe(projectId);
      expect(res.body.data.project).not.toBeNull();
    });

    // T1: POST /todos with project_id (exists) → 201 — covered above

    it('T2: POST /todos with non-existent project_id returns 404', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Bad project', domain: 'work', project_id: 99999 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toBe('project not found');
    });

    it('T3: POST /todos with project_name returns 400', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'With name', domain: 'work', project_name: 'Some Project' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toBe('project_name is no longer supported, create project first via POST /api/projects');
    });

    // T4: POST /todos without project field → projectId=null — covered by first test

    it('creates todo with tag_ids (201, tags populated)', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Tagged todo', domain: 'work', tag_ids: [tagId] });

      expect(res.status).toBe(201);
      expect(res.body.data.tags).toHaveLength(1);
      expect(res.body.data.tags[0].tag_id).toBe(tagId);
    });

    // C1: POST /api/todos 不传 comment → comment IS NULL, v1 comment IS NULL
    it('C1: creates todo without comment, comment is null', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'C1 no comment', domain: 'work' });

      expect(res.status).toBe(201);
      expect(res.body.data.comment).toBeNull();

      const vRes = await request(app)
        .get(`/api/todos/${res.body.data.id}/versions/1`)
        .set(authHeader(token));
      expect(vRes.body.data.comment).toBeNull();
    });

    // C2: POST /api/todos 传 comment="abc" → comment="abc", v1 comment="abc"
    it('C2: creates todo with comment, comment saved', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'C2 with comment', domain: 'work', comment: 'abc' });

      expect(res.status).toBe(201);
      expect(res.body.data.comment).toBe('abc');

      const vRes = await request(app)
        .get(`/api/todos/${res.body.data.id}/versions/1`)
        .set(authHeader(token));
      expect(vRes.body.data.comment).toBe('abc');
    });

    // C3: POST /api/todos 传 comment=空字符串 → comment IS NULL
    it('C3: creates todo with empty comment, comment is null', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'C3 empty comment', domain: 'work', comment: '' });

      expect(res.status).toBe(201);
      expect(res.body.data.comment).toBeNull();
    });
  });

  // ─── GET /api/todos ─────────────────────────────────────────────────────────

  describe('GET /api/todos', () => {
    let firstTodoId: number;
    let completedTodoId: number;

    beforeAll(async () => {
      const r1 = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Work todo', domain: 'work', project_id: projectId });
      firstTodoId = r1.body.data.id;

      const r2 = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Life todo', domain: 'life' });
      completedTodoId = r2.body.data.id;

      await request(app)
        .put(`/api/todos/${completedTodoId}`)
        .set(authHeader(token))
        .send({ status: 'completed', comment: 'done' });
    });

    it('lists all todos (200, array)', async () => {
      const res = await request(app)
        .get('/api/todos')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('filters by status=completed', async () => {
      const res = await request(app)
        .get('/api/todos?status=completed')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((t: any) => t.status === 'completed')).toBe(true);
    });

    it('filters by domain=life', async () => {
      const res = await request(app)
        .get('/api/todos?domain=life')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.data.every((t: any) => t.domain === 'life')).toBe(true);
    });

    it('group_by=project returns array of {project, todos, count, pending_count}', async () => {
      const res = await request(app)
        .get('/api/todos?group_by=project')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const group = res.body.data[0];
      expect(group).toHaveProperty('project');
      expect(group).toHaveProperty('todos');
      expect(group).toHaveProperty('count');
      expect(group).toHaveProperty('pending_count');
      expect(Array.isArray(group.todos)).toBe(true);
      expect(typeof group.count).toBe('number');
      expect(typeof group.pending_count).toBe('number');
    });
  });

  // ─── GET /api/todos/:id ──────────────────────────────────────────────────────

  describe('GET /api/todos/:id', () => {
    let todoId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Get by id', domain: 'work' });
      todoId = res.body.data.id;
    });

    it('returns todo by id (200)', async () => {
      const res = await request(app)
        .get(`/api/todos/${todoId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(todoId);
      expect(res.body.data).toHaveProperty('title');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('current_version');
    });

    it('returns 404 for non-existent todo', async () => {
      const res = await request(app)
        .get('/api/todos/99999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });

    // C8: GET /api/todos/:id 响应不含 payload，含 comment 字段
    it('C8: GET todo response has comment, not payload', async () => {
      const res = await request(app)
        .get(`/api/todos/${todoId}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('comment');
      expect(res.body.data).not.toHaveProperty('payload');
    });
  });

  // ─── PUT /api/todos/:id ──────────────────────────────────────────────────────

  describe('PUT /api/todos/:id', () => {
    let todoId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Update candidate', domain: 'work' });
      todoId = res.body.data.id;
    });

    it('updates title (200, current_version increments to 2)', async () => {
      const res = await request(app)
        .put(`/api/todos/${todoId}`)
        .set(authHeader(token))
        .send({ title: 'Updated title', comment: 'changed title' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.title).toBe('Updated title');
      expect(res.body.data.current_version).toBe(2);
    });

    it('updates tags (200, tags reflect new set, version comment recorded)', async () => {
      const res = await request(app)
        .put(`/api/todos/${todoId}`)
        .set(authHeader(token))
        .send({ tag_ids: [tagId], comment: 'added tag' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.tags).toHaveLength(1);
      expect(res.body.data.tags[0].tag_id).toBe(tagId);

      // Verify version recorded the tag change
      const versionsRes = await request(app)
        .get(`/api/todos/${todoId}/versions?order=desc&limit=1`)
        .set(authHeader(token));
      expect(versionsRes.body.data[0].comment).toBe('added tag');
    });

    // T5: PUT /todos/:id with project_name → 400
    it('T5: PUT with project_name returns 400', async () => {
      const res = await request(app)
        .put(`/api/todos/${todoId}`)
        .set(authHeader(token))
        .send({ project_name: 'Foo', comment: 'should fail' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toBe('project_name is no longer supported, create project first via POST /api/projects');
    });

    // T6: PUT /todos/:id with project_id=null → unbind
    it('T6: PUT with project_id=null unbinds project', async () => {
      // First bind to a project
      const bindRes = await request(app)
        .put(`/api/todos/${todoId}`)
        .set(authHeader(token))
        .send({ project_id: projectId, comment: 'bind to project' });
      expect(bindRes.body.data.project_id).toBe(projectId);

      // Then unbind
      const res = await request(app)
        .put(`/api/todos/${todoId}`)
        .set(authHeader(token))
        .send({ project_id: null, comment: 'unbind' });

      expect(res.status).toBe(200);
      expect(res.body.data.project_id).toBeNull();
      expect(res.body.data.project).toBeNull();
    });

    // T7: PUT /todos/:id with non-existent project_id → 404
    it('T7: PUT with non-existent project_id returns 404', async () => {
      const res = await request(app)
        .put(`/api/todos/${todoId}`)
        .set(authHeader(token))
        .send({ project_id: 99999, comment: 'bad project' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
      expect(res.body.message).toBe('project not found');
    });
  });

  // ─── PUT status (merged from POST /status) ──────────────────────────────────

  describe('PUT /api/todos/:id (status field)', () => {
    let statusTodoId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Status todo', domain: 'work' });
      statusTodoId = res.body.data.id;
    });

    // U1: PUT status in_progress
    it('U1: sets status to in_progress (200, version created)', async () => {
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ status: 'in_progress', comment: 'started' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.current_version).toBeGreaterThan(1);
    });

    // U2: PUT status completed → completed_at set
    it('U2: sets status to completed sets completed_at', async () => {
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ status: 'completed', comment: 'done' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completed_at).not.toBeNull();
    });

    // U3: completed → in_progress clears completed_at
    it('U3: completed → in_progress clears completed_at', async () => {
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ status: 'in_progress', comment: 'reopened' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.completed_at).toBeNull();
    });

    // U4: invalid status → 400
    it('U4: invalid status returns 400', async () => {
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ status: 'invalid', comment: 'bad' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('invalid status');
    });

    // U5: title + status both updated
    it('U5: updates title and status together', async () => {
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ title: 'Status + title', status: 'blocked', comment: 'blocked for now' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Status + title');
      expect(res.body.data.status).toBe('blocked');
    });

    // U6: no status → status unchanged (regression)
    it('U6: PUT without status leaves status unchanged', async () => {
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ title: 'No status change', comment: 'title only' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('blocked');
    });

    // U7: POST /status route → 404
    it('U7: POST /api/todos/:id/status returns 404', async () => {
      const res = await request(app)
        .post(`/api/todos/${statusTodoId}/status`)
        .set(authHeader(token))
        .send({ status: 'completed', comment: 'bad' });

      expect(res.status).toBe(404);
    });

    // U8: same status PUT → 200, no version created
    it('U8: PUT same status creates no version', async () => {
      // Get current version and comment
      const before = await request(app)
        .get(`/api/todos/${statusTodoId}`)
        .set(authHeader(token));
      const v = before.body.data.current_version;
      const currentComment = before.body.data.comment;

      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ status: 'blocked', comment: currentComment }); // same as current

      expect(res.status).toBe(200);
      expect(res.body.data.current_version).toBe(v); // no version created
    });

    // U9: User A PUT User B's todo → 404
    it('U9: PUT another user todo returns 404', async () => {
      const { token: otherToken } = await createAuthenticatedUser('otheruser');
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(otherToken))
        .send({ status: 'completed', comment: 'hack' });

      expect(res.status).toBe(404);
    });

    // C4: PUT /api/todos/:id 不传 comment → 400
    it('C4: PUT without comment returns 400', async () => {
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('comment is required');
    });

    // C5: PUT /api/todos/:id 传 comment + 改 status → 200, v(n+1) comment = 新值
    it('C5: PUT with comment and status change, version recorded', async () => {
      const before = await request(app)
        .get(`/api/todos/${statusTodoId}`)
        .set(authHeader(token));
      const prevVersion = before.body.data.current_version;

      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ status: 'completed', comment: 'finally done' });

      expect(res.status).toBe(200);
      expect(res.body.data.comment).toBe('finally done');
      const vRes = await request(app)
        .get(`/api/todos/${statusTodoId}/versions?order=desc&limit=1`)
        .set(authHeader(token));
      expect(vRes.body.data[0].comment).toBe('finally done');
      expect(vRes.body.data[0].version_number).toBe(prevVersion + 1);
    });

    // C6: PUT /api/todos/:id 仅传 comment（无其他变化）→ 200, 写新版本
    it('C6: PUT only comment change creates version', async () => {
      // Create a fresh todo for this test
      const r = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'C6 test', domain: 'work', comment: 'v1' });
      const id = r.body.data.id;
      expect(r.body.data.current_version).toBe(1);

      const res = await request(app)
        .put(`/api/todos/${id}`)
        .set(authHeader(token))
        .send({ comment: 'changed comment only' });

      expect(res.status).toBe(200);
      expect(res.body.data.comment).toBe('changed comment only');
      expect(res.body.data.current_version).toBe(2);
    });

    // C7: PUT /api/todos/:id comment 长度 501 → 400
    it('C7: PUT comment too long returns 400', async () => {
      const long = 'a'.repeat(501);
      const res = await request(app)
        .put(`/api/todos/${statusTodoId}`)
        .set(authHeader(token))
        .send({ comment: long });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('comment too long (max 500)');
    });

    // U10: versions limit clamp
    it('U10: GET versions limit clamps to max 200', async () => {
      const res = await request(app)
        .get(`/api/todos/${statusTodoId}/versions`)
        .set(authHeader(token))
        .query({ limit: 500 });
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(200);
    });
  });

  // ─── DELETE /api/todos/:id ───────────────────────────────────────────────────

  describe('DELETE /api/todos/:id', () => {
    it('deletes a todo (200)', async () => {
      const createRes = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Delete me', domain: 'life' });
      const id = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/todos/${id}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('returns 404 when deleting non-existent todo', async () => {
      const res = await request(app)
        .delete('/api/todos/99999')
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });
  });

  // ─── GET /api/todos/:id/versions ─────────────────────────────────────────────

  describe('GET /api/todos/:id/versions', () => {
    let todoId: number;

    beforeAll(async () => {
      const r = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Versioned todo', domain: 'work' });
      todoId = r.body.data.id;

      // Create a second version by updating the title
      await request(app)
        .put(`/api/todos/${todoId}`)
        .set(authHeader(token))
        .send({ title: 'Versioned todo v2', comment: 'updated' });
    });

    it('returns version list (200, default order desc)', async () => {
      const res = await request(app)
        .get(`/api/todos/${todoId}/versions`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      // Default is desc: first entry has the higher version number
      expect(res.body.data[0].version_number).toBeGreaterThan(res.body.data[1].version_number);
    });

    // C9: GET versions 响应不含 payload/change_summary，含 comment
    it('C9: version list items have comment, not payload or change_summary', async () => {
      const res = await request(app)
        .get(`/api/todos/${todoId}/versions`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const v = res.body.data[0];
      expect(v).toHaveProperty('comment');
      expect(v).not.toHaveProperty('payload');
      expect(v).not.toHaveProperty('change_summary');
    });
  });

  // ─── GET /api/todos/:id/versions/:num ────────────────────────────────────────

  describe('GET /api/todos/:id/versions/:num', () => {
    let todoId: number;

    beforeAll(async () => {
      const r = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'Version lookup todo', domain: 'work' });
      todoId = r.body.data.id;
    });

    it('returns specific version by number (200)', async () => {
      const res = await request(app)
        .get(`/api/todos/${todoId}/versions/1`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.version_number).toBe(1);
      expect(res.body.data.todo_id).toBe(todoId);
      expect(res.body.data).toHaveProperty('title');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('comment');
    });

    it('returns 404 for non-existent version number', async () => {
      const res = await request(app)
        .get(`/api/todos/${todoId}/versions/999`)
        .set(authHeader(token));

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1);
    });
  });

  // ─── Auth ────────────────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/todos');
      expect(res.status).toBe(401);
    });
  });

  // ─── keyword + 未知参数白名单 (v1.11.0) ──────────────────────────────────────

  describe('GET /api/todos — keyword + 未知参数白名单 (v1.11.0)', () => {
    beforeAll(async () => {
      await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: '周报整理', domain: 'work' });

      await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: '其他任务', domain: 'work' });

      await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: '100%完成', domain: 'life' });
    });

    it('T1: keyword=周报 命中 title', async () => {
      const res = await request(app)
        .get('/api/todos?keyword=周报')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('周报整理');
    });

    it('T2: keyword=空白 不过滤', async () => {
      const res = await request(app)
        .get('/api/todos?keyword=   ')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const titles = res.body.data.map((t: any) => t.title);
      expect(titles).toContain('周报整理');
      expect(titles).toContain('其他任务');
    });

    it('T3: 未知参数 limit=10 返回 400', async () => {
      const res = await request(app)
        .get('/api/todos?limit=10')
        .set(authHeader(token));

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('limit');
    });

    it('T4: keyword=100% 字面量匹配', async () => {
      const res = await request(app)
        .get('/api/todos?keyword=100%25')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('100%完成');
    });
  });

  // ─── DateTime TZ (v1.10.3) ──────────────────────────────────────────────────

  describe('DateTime TZ — due_at (v1.10.3)', () => {
    it('T8: bare due_at sent as local time → stored as correct UTC', async () => {
      const res = await request(app)
        .post('/api/todos')
        .set(authHeader(token))
        .send({ title: 'T8 due_at test', domain: 'work', due_at: '2026-06-18T22:00:00' });

      expect(res.status).toBe(201);
      expect(res.body.data.due_at).toBe('2026-06-18T14:00:00.000Z');
    });
  });
});
