import request from 'supertest';
import { app, createAuthenticatedUser, authHeader } from './helpers.js';
import { truncateAll } from './setup.js';

async function makeProject(t: string, name: string, domain = 'work'): Promise<number> {
  const res = await request(app)
    .post('/api/projects')
    .set(authHeader(t))
    .send({ name, domain });
  return res.body.data.project_id as number;
}

// Truncate once before all tests in this file.
// Each describe creates its own user to avoid domain-uniqueness conflicts
// and to prevent cross-file truncateAll races from wiping shared state.
beforeAll(async () => {
  await truncateAll();
});

describe('POST /api/projects', () => {
  let token: string;
  let userId: number;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    token = user.token;
    userId = user.userId;
  });

  it('creates a project (201)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'My Project', domain: 'work' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data.name).toBe('My Project');
    expect(res.body.data.domain).toBe('work');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.user_id).toBe(userId);
    expect(res.body.data).toHaveProperty('project_id');
    expect(res.body.data).toHaveProperty('created_at');
    expect(res.body.data).toHaveProperty('updated_at');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ domain: 'work' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  it('returns 400 when domain is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'No Domain Project' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
  });

  // P1: same domain + same name → 409 with data
  it('P1: duplicate (same domain + same name) returns 409 with existing project data', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'My Project', domain: 'work' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(1);
    expect(res.body.message).toBe('project with this name already exists in domain');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.name).toBe('My Project');
    expect(res.body.data.domain).toBe('work');
    expect(res.body.data).toHaveProperty('project_id');
  });

  // P2: same domain + different name → both succeed
  it('P2: same domain different name allows creation', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Another Work Project', domain: 'work' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Another Work Project');
  });

  // P3: different domain + same name → both succeed
  it('P3: different domain same name allows creation', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'My Project', domain: 'life' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('My Project');
    expect(res.body.data.domain).toBe('life');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'No Auth', domain: 'work' });

    expect(res.status).toBe(401);
  });

  it('P1: POST with valid hex color returns 201', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Colored Project', domain: 'work', color: '#3b82f6' });

    expect(res.status).toBe(201);
    expect(res.body.data.color).toBe('#3b82f6');
  });

  it('P2: POST with non-hex color returns 400', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Bad Color', domain: 'work', color: 'red' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('invalid color format');
  });
});

// Each describe below gets its own user to avoid domain-uniqueness conflicts
// (the API enforces one project per domain per user)

describe('GET /api/projects', () => {
  let getToken: string;
  let workProjectId: number;
  let archivedProjectId: number;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    getToken = user.token;

    // Create work project (active) and life project, then archive life
    workProjectId = await makeProject(getToken, 'Work Project Alpha', 'work');
    archivedProjectId = await makeProject(getToken, 'Life Project Alpha', 'life');
    await request(app)
      .put(`/api/projects/${archivedProjectId}`).send({ status: 'archived' })
      .set(authHeader(getToken));
  });

  it('returns list of projects (200)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set(authHeader(getToken));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns only active projects by default', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set(authHeader(getToken));

    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p.status).toBe('active');
    });
    const ids = res.body.data.map((p: any) => p.project_id);
    expect(ids).not.toContain(archivedProjectId);
    expect(ids).toContain(workProjectId);
  });

  it('includes archived projects when include_archived=true', async () => {
    const res = await request(app)
      .get('/api/projects?include_archived=true')
      .set(authHeader(getToken));

    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: any) => p.project_id);
    expect(ids).toContain(archivedProjectId);
    expect(ids).toContain(workProjectId);
  });

  it('filters by domain', async () => {
    const res = await request(app)
      .get('/api/projects?domain=work')
      .set(authHeader(getToken));

    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p.domain).toBe('work');
    });
    expect(res.body.data.map((p: any) => p.project_id)).toContain(workProjectId);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('P4: GET returns items with color field (null when unset)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set(authHeader(getToken));

    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p).toHaveProperty('color');
    });
    // project created without color should have color === null
    const p = res.body.data.find((x: any) => x.project_id === workProjectId);
    expect(p.color).toBeNull();
  });
});

// ─── keyword + 未知参数白名单 (v1.11.0) ──────────────────────────────────────

describe('GET /api/projects — keyword + 未知参数白名单 (v1.11.0)', () => {
  let kwToken: string;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    kwToken = user.token;

    await makeProject(kwToken, '周报系统', 'work');
    await makeProject(kwToken, '其他项目', 'life');
    await makeProject(kwToken, '100%里程碑', 'work');
    await makeProject(kwToken, '日常开销', 'life');
  });

  it('T1: keyword=周报 命中 name', async () => {
    const res = await request(app)
      .get('/api/projects?keyword=周报')
      .set(authHeader(kwToken));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('周报系统');
  });

  it('T2: keyword=空白 不过滤', async () => {
    const res = await request(app)
      .get('/api/projects?keyword=   ')
      .set(authHeader(kwToken));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const names = res.body.data.map((p: any) => p.name);
    expect(names).toContain('周报系统');
    expect(names).toContain('其他项目');
  });

  it('T3: 未知参数 limit=10 返回 400', async () => {
    const res = await request(app)
      .get('/api/projects?limit=10')
      .set(authHeader(kwToken));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('limit');
  });

  it('T4: keyword=100% 字面量匹配', async () => {
    const res = await request(app)
      .get('/api/projects?keyword=100%25')
      .set(authHeader(kwToken));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('100%里程碑');
  });
});

describe('PUT /api/projects/:id', () => {
  let putToken: string;
  let projectId: number;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    putToken = user.token;
    projectId = await makeProject(putToken, 'Update Me', 'work');
  });

  it('updates project name (200)', async () => {
    const res = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(authHeader(putToken))
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.name).toBe('Updated Name');
    expect(res.body.data.project_id).toBe(projectId);
  });

    // P1: PUT status archived
    it('P1: PUT status archived sets project to archived', async () => {
      const res = await request(app).put('/api/projects/' + projectId).set(authHeader(putToken)).send({status:'archived'});
      expect(res.status).toBe(200); expect(res.body.data.status).toBe('archived');
    });
    // P2: PUT status active restores
    it('P2: PUT status active restores archived project', async () => {
      const pid = await makeProject(putToken, 'Rest' + Date.now(), 'life');
      await request(app).put('/api/projects/' + pid).set(authHeader(putToken)).send({status:'archived'});
      const res = await request(app).put('/api/projects/' + pid).set(authHeader(putToken)).send({status:'active'});
      expect(res.status).toBe(200); expect(res.body.data.status).toBe('active');
    });
    // P3: invalid status
    it('P3: PUT invalid status returns 400', async () => {
      const res = await request(app).put('/api/projects/' + projectId).set(authHeader(putToken)).send({status:'invalid'});
      expect(res.status).toBe(400); expect(res.body.message).toContain('invalid status');
    });
    // P4: POST /archive returns 404
    it('P4: POST /archive returns 404', async () => {
      const res = await request(app).post('/api/projects/' + projectId + '/archive').set(authHeader(putToken));
      expect(res.status).toBe(404);
    });
    // P5: POST /unarchive returns 404
    it('P5: POST /unarchive returns 404', async () => {
      const res = await request(app).post('/api/projects/' + projectId + '/unarchive').set(authHeader(putToken));
      expect(res.status).toBe(404);
    });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .put('/api/projects/999999')
      .set(authHeader(putToken))
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('P5: PUT rejects invalid color format', async () => {
    const res = await request(app)
      .put(`/api/projects/${projectId}`)
      .set(authHeader(putToken))
      .send({ color: 'red' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('invalid color format');
  });

  it('P3: PUT color null clears color', async () => {
    const pid = await makeProject(putToken, 'NullColor' + Date.now(), 'work');
    const res = await request(app)
      .put(`/api/projects/${pid}`)
      .set(authHeader(putToken))
      .send({ color: null });

    expect(res.status).toBe(200);
    expect(res.body.data.color).toBe(null);

    const listRes = await request(app)
      .get('/api/projects')
      .set(authHeader(putToken));

    const project = listRes.body.data.find((p: any) => p.project_id === pid);
    expect(project.color).toBe(null);
  });
});

describe('DELETE /api/projects/:id', () => {
  let deleteToken: string;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    deleteToken = user.token;
  });

  it('deletes project (200)', async () => {
    const projectId = await makeProject(deleteToken, 'Delete Me', 'work');

    const res = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set(authHeader(deleteToken));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .delete('/api/projects/999999')
      .set(authHeader(deleteToken));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/projects/1');
    expect(res.status).toBe(401);
  });
});
