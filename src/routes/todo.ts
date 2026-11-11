import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { validateQueryParams, escapeLikePattern, applyKeywordFilter } from '../utils/validateQuery.js';
import { parseLocalDateTime } from '../utils/datetime.js';

export const todoRouter = Router();

// ─── toDict helpers ──────────────────────────────────────────────────────────

function tagToDict(tag: any) {
  return {
    tag_id: Number(tag.tagId),
    user_id: Number(tag.userId),
    tag_name: tag.tagName,
    color: tag.color ?? null,
    created_at: (tag.createdAt as Date).toISOString(),
  };
}

function projectToDict(p: any) {
  if (!p) return null;
  return {
    id: Number(p.id),
    user_id: Number(p.userId),
    domain: p.domain,
    name: p.name,
    status: p.status,
    color: p.color ?? null,
    created_at: (p.createdAt as Date).toISOString(),
    updated_at: (p.updatedAt as Date).toISOString(),
  };
}

function todoToDict(todo: any, currentVersion: number | null) {
  return {
    id: Number(todo.id),
    user_id: Number(todo.userId),
    domain: todo.domain,
    project_id: todo.projectId != null ? Number(todo.projectId) : null,
    project: todo.project ? projectToDict(todo.project) : null,
    title: todo.title,
    status: todo.status,
    due_at: todo.dueAt ? (todo.dueAt as Date).toISOString() : null,
    completed_at: todo.completedAt ? (todo.completedAt as Date).toISOString() : null,
    comment: todo.comment ?? null,
    tags: (todo.todoTags ?? []).map((tt: any) => tagToDict(tt.tag)),
    created_at: (todo.createdAt as Date).toISOString(),
    updated_at: (todo.updatedAt as Date).toISOString(),
    current_version: currentVersion,
  };
}

function versionToDict(v: any) {
  return {
    id: Number(v.id),
    todo_id: Number(v.todoId),
    version_number: v.versionNumber,
    title: v.title,
    status: v.status,
    domain: v.domain,
    project_id: v.projectId != null ? Number(v.projectId) : null,
    due_at: v.dueAt ? (v.dueAt as Date).toISOString() : null,
    completed_at: v.completedAt ? (v.completedAt as Date).toISOString() : null,
    comment: v.comment ?? null,
    tag_ids: v.tagIds ? JSON.parse(v.tagIds) : null,
    created_at: (v.createdAt as Date).toISOString(),
  };
}

// ─── Versioning helpers ───────────────────────────────────────────────────────

async function getLatestVersionNumber(todoId: number): Promise<number | null> {
  const latest = await prisma.todoVersion.findFirst({
    where: { todoId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  return latest?.versionNumber ?? null;
}

async function createTodoVersion(
  todoId: number,
  todo: any,
  tagIds: number[],
  comment: string | null,
): Promise<void> {
  const last = await getLatestVersionNumber(todoId);
  const nextVersion = (last ?? 0) + 1;
  await prisma.todoVersion.create({
    data: {
      todoId,
      versionNumber: nextVersion,
      title: todo.title,
      status: todo.status,
      domain: todo.domain,
      projectId: todo.projectId ?? null,
      dueAt: todo.dueAt ?? null,
      completedAt: todo.completedAt ?? null,
      comment,
      tagIds: JSON.stringify(tagIds.map(Number)),
      createdAt: new Date(),
    },
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/todos
todoRouter.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);

  const ALLOWED = ['domain', 'project_id', 'status', 'tag_id', 'group_by', 'include_archived', 'project_status', 'keyword'] as const;
  const unknown = validateQueryParams(req.query, ALLOWED);
  if (unknown.length) {
    const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
    return res.status(r.statusCode).json(r.body);
  }

  const { domain, project_id, status, tag_id, group_by, include_archived, project_status, keyword } = req.query;

  if (group_by === 'project') {
    const projectWhere: any = { userId };
    if (domain) projectWhere.domain = domain;
    if (include_archived === 'true') {
      if (project_status) projectWhere.status = project_status;
      // else no status filter → all statuses
    } else {
      projectWhere.status = project_status ?? 'active';
    }

    const projects = await prisma.project.findMany({ where: projectWhere });

    const result = await Promise.all(
      projects.map(async (project) => {
        const todoWhere: any = { userId, projectId: project.id };
        await applyKeywordFilter(todoWhere, keyword, 'title', { table: 'todos', column: 'title', pk: 'id', pkColumn: 'id' });
        const todos = await prisma.todo.findMany({
          where: todoWhere,
          include: { project: true, todoTags: { include: { tag: true } } },
          orderBy: { createdAt: 'desc' },
        });
        const versionNumbers = await Promise.all(
          todos.map((t) => getLatestVersionNumber(t.id)),
        );
        const todoList = todos.map((t, i) => todoToDict(t, versionNumbers[i]));
        return {
          project: projectToDict(project),
          todos: todoList,
          count: todoList.length,
          pending_count: todoList.filter((t) => t.status === 'not_started').length,
        };
      }),
    );

    const r = successResponse(result);
    return res.status(r.statusCode).json(r.body);
  }

  // Normal list mode
  const where: any = { userId };
  if (domain) where.domain = domain;
  if (project_id) where.projectId = Number(project_id as string);
  if (status) where.status = status;
  if (tag_id) where.todoTags = { some: { tagId: Number(tag_id as string) } };
  await applyKeywordFilter(where, keyword, 'title', { table: 'todos', column: 'title', pk: 'id', pkColumn: 'id' });

  const todos = await prisma.todo.findMany({
    where,
    include: { project: true, todoTags: { include: { tag: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const versionNumbers = await Promise.all(todos.map((t) => getLatestVersionNumber(t.id)));
  const r = successResponse(todos.map((t, i) => todoToDict(t, versionNumbers[i])));
  res.status(r.statusCode).json(r.body);
});

// POST /api/todos
todoRouter.post('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { title, domain, project_id, due_at, comment, tag_ids } = req.body;

  if (!title || !domain) {
    const r = errorResponse('title and domain are required');
    return res.status(r.statusCode).json(r.body);
  }
  if (!['work', 'life'].includes(domain)) {
    const r = errorResponse('domain must be work or life');
    return res.status(r.statusCode).json(r.body);
  }

  if (req.body.project_name !== undefined) {
    const r = errorResponse('project_name is no longer supported, create project first via POST /api/projects');
    return res.status(r.statusCode).json(r.body);
  }

  let resolvedProjectId: number | null = null;
  if (project_id != null) {
    const exists = await prisma.project.findFirst({ where: { id: Number(project_id), userId } });
    if (!exists) {
      const r = errorResponse('project not found', 404);
      return res.status(r.statusCode).json(r.body);
    }
    resolvedProjectId = Number(project_id);
  }

  const tagIdsBigInt: number[] = (tag_ids ?? []).map((id: any) => Number(id));
  const now = new Date();

  // comment 空字符串等价于 NULL
  const resolvedComment = (typeof comment === 'string' && comment.trim() !== '') ? comment : null;

  let dueAt: Date | null = null;
  if (due_at) {
    try {
      dueAt = parseLocalDateTime(due_at);
    } catch (e: any) {
      const r = errorResponse(e.message, 400);
      return res.status(400).json(r.body);
    }
  }

  const todo = await prisma.todo.create({
    data: {
      userId,
      domain,
      projectId: resolvedProjectId,
      title,
      status: 'in_progress',
      dueAt,
      comment: resolvedComment,
      createdAt: now,
      updatedAt: now,
      todoTags: tagIdsBigInt.length > 0
        ? { create: tagIdsBigInt.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: { project: true, todoTags: { include: { tag: true } } },
  });

  await createTodoVersion(todo.id, todo, tagIdsBigInt, resolvedComment);

  const currentVersion = await getLatestVersionNumber(todo.id);
  const r = successResponse(todoToDict(todo, currentVersion));
  res.status(201).json(r.body);
});

// GET /api/todos/:todoId
todoRouter.get('/:todoId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const todoId = Number(req.params.todoId);

  const todo = await prisma.todo.findFirst({
    where: { id: todoId, userId },
    include: { project: true, todoTags: { include: { tag: true } } },
  });

  if (!todo) {
    const r = errorResponse('todo not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const currentVersion = await getLatestVersionNumber(todo.id);
  const r = successResponse(todoToDict(todo, currentVersion));
  res.status(r.statusCode).json(r.body);
});

// PUT /api/todos/:todoId
todoRouter.put('/:todoId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const todoId = Number(req.params.todoId);

  const todo = await prisma.todo.findFirst({
    where: { id: todoId, userId },
    include: { todoTags: true },
  });
  if (!todo) {
    const r = errorResponse('todo not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const { title, domain, project_id, due_at, comment, tag_ids, status } = req.body;

  // comment 必填校验
  if (comment === undefined || comment === null) {
    const r = errorResponse('comment is required', 400);
    return res.status(r.statusCode).json(r.body);
  }
  if (typeof comment === 'string' && comment.length > 500) {
    const r = errorResponse('comment too long (max 500)', 400);
    return res.status(r.statusCode).json(r.body);
  }

  if (req.body.project_name !== undefined) {
    const r = errorResponse('project_name is no longer supported, create project first via POST /api/projects');
    return res.status(r.statusCode).json(r.body);
  }

  const changes: string[] = [];
  const updateData: any = { updatedAt: new Date() };

  // ── status ──
  if (status !== undefined) {
    const validStatuses = ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      const r = errorResponse(`invalid status: ${status}`);
      return res.status(r.statusCode).json(r.body);
    }
    if (status !== todo.status) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completedAt = new Date();
      } else if (todo.status === 'completed') {
        updateData.completedAt = null;
      }
      changes.push('status');
    }
  }

  if (title !== undefined && title !== todo.title) {
    updateData.title = title;
    changes.push('title');
  }
  if (domain !== undefined && domain !== todo.domain) {
    updateData.domain = domain;
    changes.push('domain');
  }
  if (due_at !== undefined) {
    let newDueAt: Date | null = null;
    if (due_at) {
      try {
        newDueAt = parseLocalDateTime(due_at);
      } catch (e: any) {
        const r = errorResponse(e.message, 400);
        return res.status(400).json(r.body);
      }
    }
    const oldStr = todo.dueAt ? todo.dueAt.toISOString() : null;
    const newStr = newDueAt ? newDueAt.toISOString() : null;
    if (oldStr !== newStr) {
      updateData.dueAt = newDueAt;
      changes.push('due_at');
    }
  }
  // comment 总是写入（PUT 必填已校验），变化时记入 changes
  const resolvedComment = typeof comment === 'string' ? comment : '';
  if (resolvedComment !== (todo.comment ?? '')) {
    changes.push('comment');
  }
  updateData.comment = resolvedComment;

  if (project_id !== undefined) {
    const newProjId = project_id != null ? Number(project_id) : null;
    if (newProjId !== null) {
      const exists = await prisma.project.findFirst({ where: { id: newProjId, userId } });
      if (!exists) {
        const r = errorResponse('project not found', 404);
        return res.status(r.statusCode).json(r.body);
      }
    }
    if (String(newProjId) !== String(todo.projectId)) changes.push('project');
    updateData.projectId = newProjId;
  }

  let effectiveTagIds: number[] = todo.todoTags.map((tt) => tt.tagId);
  if (tag_ids !== undefined) {
    const newTagIds: number[] = (tag_ids as any[]).map((id: any) => Number(id));
    const oldSorted = effectiveTagIds.map(String).sort().join(',');
    const newSorted = newTagIds.map(String).sort().join(',');
    if (oldSorted !== newSorted) changes.push('tags');
    effectiveTagIds = newTagIds;
    updateData.todoTags = {
      deleteMany: {},
      create: newTagIds.map((tagId) => ({ tagId })),
    };
  }

  const updated = await prisma.todo.update({
    where: { id: todoId },
    data: updateData,
    include: { project: true, todoTags: { include: { tag: true } } },
  });

  if (changes.length > 0) {
    await createTodoVersion(todoId, updated, effectiveTagIds, resolvedComment);
  }

  const currentVersion = await getLatestVersionNumber(todoId);
  const r = successResponse(todoToDict(updated, currentVersion));
  res.status(r.statusCode).json(r.body);
});

// DELETE /api/todos/:todoId
todoRouter.delete('/:todoId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const todoId = Number(req.params.todoId);

  const todo = await prisma.todo.findFirst({ where: { id: todoId, userId } });
  if (!todo) {
    const r = errorResponse('todo not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  await prisma.todo.delete({ where: { id: todoId } });

  const r = successResponse(null);
  res.status(r.statusCode).json(r.body);
});

// GET /api/todos/:todoId/versions
todoRouter.get('/:todoId/versions', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const todoId = Number(req.params.todoId);

  const todo = await prisma.todo.findFirst({ where: { id: todoId, userId } });
  if (!todo) {
    const r = errorResponse('todo not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const order = req.query.order === 'asc' ? ('asc' as const) : ('desc' as const);
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  const versions = await prisma.todoVersion.findMany({
    where: { todoId },
    orderBy: { versionNumber: order },
    take: limit,
  });

  const r = successResponse(versions.map(versionToDict));
  res.status(r.statusCode).json(r.body);
});

// GET /api/todos/:todoId/versions/:versionNumber
todoRouter.get('/:todoId/versions/:versionNumber', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const todoId = Number(req.params.todoId);
  const versionNumber = Number(req.params.versionNumber);

  const todo = await prisma.todo.findFirst({ where: { id: todoId, userId } });
  if (!todo) {
    const r = errorResponse('todo not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const version = await prisma.todoVersion.findUnique({
    where: { todoId_versionNumber: { todoId, versionNumber } },
  });
  if (!version) {
    const r = errorResponse('version not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const r = successResponse(versionToDict(version));
  res.status(r.statusCode).json(r.body);
});
