import request from 'supertest';
import { app } from '../src/app.js';

export { app };

let userCounter = 0;

export async function createAuthenticatedUser(username?: string): Promise<{ token: string; userId: number }> {
  const name = username ?? `testuser_${Date.now()}_${++userCounter}`;
  const password = 'Test1234!';

  await request(app)
    .post('/api/users/register')
    .send({ username: name, password });

  const loginRes = await request(app)
    .post('/api/users/login')
    .send({ username: name, password });

  return {
    token: loginRes.body.data.token,
    userId: loginRes.body.data.user.user_id,
  };
}

export async function createCategory(
  token: string,
  data?: { category_name?: string; category_type?: string; icon?: string; color?: string },
): Promise<number> {
  const res = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({
      category_name: data?.category_name ?? '测试分类',
      category_type: data?.category_type ?? 'expense',
      icon: data?.icon,
      color: data?.color,
    });
  return res.body.data.category_id;
}

export async function createTag(token: string, name?: string): Promise<number> {
  const tagName = name ?? `tag_${Date.now()}_${++userCounter}`;
  const res = await request(app)
    .post('/api/tags')
    .set('Authorization', `Bearer ${token}`)
    .send({ tag_name: tagName });
  return res.body.data.tag_id;
}

export async function createProject(
  token: string,
  data?: { name?: string; domain?: string },
): Promise<number> {
  const res = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: data?.name ?? `project_${Date.now()}_${++userCounter}`,
      domain: data?.domain ?? 'work',
    });
  return res.body.data.project_id;
}

export async function createCheckinTemplate(
  token: string,
  data?: { name?: string; fields_schema?: any[] },
): Promise<number> {
  const res = await request(app)
    .post('/api/checkin-templates')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: data?.name ?? `template_${Date.now()}_${++userCounter}`,
      fields_schema: data?.fields_schema ?? [
        { key: 'note', type: 'text', required: false },
      ],
    });
  return res.body.data.id;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
