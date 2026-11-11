import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { validateQueryParams, escapeLikePattern, applyKeywordFilter } from '../utils/validateQuery.js';

export const tagRouter = Router();

function tagToDict(tag: {
  tagId: number;
  userId: number;
  tagName: string;
  color: string | null;
  createdAt: Date;
}) {
  return {
    tag_id: Number(tag.tagId),
    user_id: Number(tag.userId),
    tag_name: tag.tagName,
    color: tag.color,
    created_at: tag.createdAt.toISOString(),
  };
}

// GET /
tagRouter.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);

  const ALLOWED = ['keyword'] as const;
  const unknown = validateQueryParams(req.query, ALLOWED);
  if (unknown.length) {
    const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
    return res.status(r.statusCode).json(r.body);
  }

  const where: any = { userId };
  const { keyword } = req.query;
  await applyKeywordFilter(where, keyword, 'tagName', { table: 'tags', column: 'tag_name', pk: 'tagId', pkColumn: 'tag_id' });

  const tags = await prisma.tag.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
  const r = successResponse(tags.map(tagToDict));
  res.status(r.statusCode).json(r.body);
});

// POST /
tagRouter.post('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { tag_name, color } = req.body;

  if (!tag_name) {
    const r = errorResponse('tag_name is required', 400);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const existing = await prisma.tag.findFirst({ where: { userId, tagName: tag_name } });
  if (existing) {
    const r = errorResponse('tag name already exists', 409);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const tag = await prisma.tag.create({
    data: { userId, tagName: tag_name, color: color ?? null },
  });
  const r = successResponse(tagToDict(tag), 'created', 201);
  res.status(r.statusCode).json(r.body);
});

// PUT /:tagId
tagRouter.put('/:tagId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const tagId = Number(req.params.tagId);

  const tag = await prisma.tag.findFirst({ where: { tagId, userId } });
  if (!tag) {
    const r = errorResponse('tag not found', 404);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const { tag_name, color } = req.body;

  if (tag_name && tag_name !== tag.tagName) {
    const conflict = await prisma.tag.findFirst({ where: { userId, tagName: tag_name } });
    if (conflict) {
      const r = errorResponse('tag name already exists', 409);
      res.status(r.statusCode).json(r.body);
      return;
    }
  }

  const updated = await prisma.tag.update({
    where: { tagId },
    data: {
      ...(tag_name !== undefined && { tagName: tag_name }),
      ...(color !== undefined && { color }),
    },
  });
  const r = successResponse(tagToDict(updated));
  res.status(r.statusCode).json(r.body);
});

// DELETE /:tagId
tagRouter.delete('/:tagId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const tagId = Number(req.params.tagId);

  const tag = await prisma.tag.findFirst({ where: { tagId, userId } });
  if (!tag) {
    const r = errorResponse('tag not found', 404);
    res.status(r.statusCode).json(r.body);
    return;
  }

  await prisma.tag.delete({ where: { tagId } });
  const r = successResponse(null, 'deleted');
  res.status(r.statusCode).json(r.body);
});
