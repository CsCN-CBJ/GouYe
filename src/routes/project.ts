import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { validateQueryParams, escapeLikePattern, applyKeywordFilter } from '../utils/validateQuery.js';

function isValidColor(c: unknown): c is string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
}

export const projectRouter = Router();

function projectToDict(p: {
  id: number;
  userId: number;
  name: string;
  domain: string;
  status: string;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    project_id: Number(p.id),
    user_id: Number(p.userId),
    name: p.name,
    domain: p.domain,
    status: p.status,
    color: p.color ?? null,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

// GET /
projectRouter.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);

  const ALLOWED = ['domain', 'include_archived', 'status', 'keyword'] as const;
  const unknown = validateQueryParams(req.query, ALLOWED);
  if (unknown.length) {
    const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
    return res.status(r.statusCode).json(r.body);
  }

  const { domain, include_archived, status, keyword } = req.query;

  const where: Record<string, unknown> = { userId };
  if (domain) where.domain = domain;

  if (include_archived === 'true') {
    // no status filter
  } else if (status) {
    where.status = status;
  } else {
    where.status = 'active';
  }

  await applyKeywordFilter(where, keyword, 'name', { table: 'projects', column: 'name', pk: 'id', pkColumn: 'id' });

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  const r = successResponse(projects.map(projectToDict));
  res.status(r.statusCode).json(r.body);
});

// POST /
projectRouter.post('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { name, domain, color } = req.body;

  if (!name || !domain) {
    const r = errorResponse('name and domain are required', 400);
    res.status(r.statusCode).json(r.body);
    return;
  }

  if (color !== undefined && color !== null && !isValidColor(color)) {
    const r = errorResponse('invalid color format');
    res.status(r.statusCode).json(r.body);
    return;
  }

  const existing = await prisma.project.findFirst({ where: { userId, domain, name } });
  if (existing) {
    const r = { code: 1, message: 'project with this name already exists in domain', data: projectToDict(existing) };
    res.status(409).json(r);
    return;
  }

  const project = await prisma.project.create({ data: { userId, name, domain, ...(isValidColor(color) && { color }) } });
  const r = successResponse(projectToDict(project), 'ok', 201);
  res.status(r.statusCode).json(r.body);
});

// PUT /:projectId
projectRouter.put('/:projectId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const projectId = Number(req.params.projectId);
  const { name, domain, status, color } = req.body;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    const r = errorResponse('project not found', 404);
    res.status(r.statusCode).json(r.body);
    return;
  }

  if (status !== undefined) {
    if (!['active', 'archived'].includes(status)) {
      const r = errorResponse(`invalid status: ${status}`);
      res.status(r.statusCode).json(r.body);
      return;
    }
  }

  if (color !== undefined && color !== null && !isValidColor(color)) {
    const r = errorResponse('invalid color format');
    res.status(r.statusCode).json(r.body);
    return;
  }

  if (domain && domain !== project.domain) {
    const duplicate = await prisma.project.findFirst({ where: { userId, domain } });
    if (duplicate) {
      const r = errorResponse('project with this domain already exists', 409);
      res.status(r.statusCode).json(r.body);
      return;
    }
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(name !== undefined && { name }),
      ...(domain !== undefined && { domain }),
      ...(status !== undefined && { status }),
      ...(color !== undefined && { color }),
    },
  });
  const r = successResponse(projectToDict(updated));
  res.status(r.statusCode).json(r.body);
});

// DELETE /:projectId
projectRouter.delete('/:projectId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const projectId = Number(req.params.projectId);

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    const r = errorResponse('project not found', 404);
    res.status(r.statusCode).json(r.body);
    return;
  }

  await prisma.project.delete({ where: { id: projectId } });
  const r = successResponse(null);
  res.status(r.statusCode).json(r.body);
});
