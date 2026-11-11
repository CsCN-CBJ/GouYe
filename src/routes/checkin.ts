import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { validateQueryParams } from '../utils/validateQuery.js';
import { parseLocalDateTime } from '../utils/datetime.js';
import { validatePayload } from '../services/template-validator.js';

const router = Router();

function toDict(c: any) {
  return {
    id: Number(c.id),
    user_id: Number(c.userId),
    template_id: Number(c.templateId),
    template: c.template
      ? {
          id: Number(c.template.id),
          name: c.template.name,
          icon: c.template.icon ?? null,
          fields_schema: JSON.parse(c.template.fieldsSchema),
        }
      : null,
    occurred_at: c.occurredAt.toISOString(),
    payload: c.payload ? JSON.parse(c.payload) : null,
    tags: (c.checkinTags ?? []).map((ct: any) => ({
      id: Number(ct.tag.tagId),
      name: ct.tag.tagName,
      color: ct.tag.color ?? null,
    })),
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

const includeRelations = {
  template: true,
  checkinTags: { include: { tag: true } },
};

// GET /
router.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);

  const ALLOWED = ['template_id', 'tag_id'] as const;
  const unknown = validateQueryParams(req.query, ALLOWED);
  if (unknown.length) {
    const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
    return res.status(r.statusCode).json(r.body);
  }

  const where: any = { userId };

  if (req.query.template_id) where.templateId = Number(req.query.template_id as string);
  if (req.query.tag_id) {
    where.checkinTags = { some: { tagId: Number(req.query.tag_id as string) } };
  }

  const checkins = await prisma.checkin.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    include: includeRelations,
  });
  const r = successResponse(checkins.map(toDict));
  res.status(r.statusCode).json(r.body);
});

// POST /
router.post('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { template_id, occurred_at, payload, tag_ids } = req.body;

  if (!template_id) {
    const r = errorResponse('template_id is required');
    return res.status(r.statusCode).json(r.body);
  }

  const templateId = Number(template_id);
  const template = await prisma.checkinTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) {
    const r = errorResponse('template not found or no permission', 404);
    return res.status(r.statusCode).json(r.body);
  }

  if (payload) {
    const result = validatePayload(JSON.parse(template.fieldsSchema) as any[], payload);
    if (!result.ok) {
      const r = errorResponse(`payload validation failed: ${result.errors.join(', ')}`);
      return res.status(r.statusCode).json(r.body);
    }
  }

  const now = new Date();
  let occurredAt: Date;
  try {
    occurredAt = occurred_at ? parseLocalDateTime(occurred_at) : now;
  } catch (e: any) {
    const r = errorResponse(e.message, 400);
    return res.status(400).json(r.body);
  }

  const checkin = await prisma.checkin.create({
    data: {
      userId,
      templateId,
      occurredAt,
      payload: payload != null ? JSON.stringify(payload) : undefined,
      createdAt: now,
      updatedAt: now,
      checkinTags: tag_ids?.length
        ? { create: (tag_ids as number[]).map((tid) => ({ tagId: Number(tid) })) }
        : undefined,
    },
    include: includeRelations,
  });
  const r = successResponse(toDict(checkin));
  res.status(r.statusCode).json(r.body);
});

// GET /:checkinId
router.get('/:checkinId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const id = Number(req.params.checkinId);

  const checkin = await prisma.checkin.findFirst({ where: { id, userId }, include: includeRelations });
  if (!checkin) {
    const r = errorResponse('checkin not found', 404);
    return res.status(r.statusCode).json(r.body);
  }
  const r = successResponse(toDict(checkin));
  res.status(r.statusCode).json(r.body);
});

// PUT /:checkinId
router.put('/:checkinId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const id = Number(req.params.checkinId);

  const checkin = await prisma.checkin.findFirst({ where: { id, userId } });
  if (!checkin) {
    const r = errorResponse('checkin not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const { template_id, occurred_at, payload, tag_ids } = req.body;

  const templateId = template_id ? Number(template_id) : checkin.templateId;

  if (template_id) {
    const template = await prisma.checkinTemplate.findFirst({ where: { id: templateId, userId } });
    if (!template) {
      const r = errorResponse('template not found or no permission', 404);
      return res.status(r.statusCode).json(r.body);
    }
  }

  if (payload !== undefined) {
    const template = await prisma.checkinTemplate.findUnique({ where: { id: templateId } });
    if (template) {
      const result = validatePayload(JSON.parse(template.fieldsSchema) as any[], payload);
      if (!result.ok) {
        const r = errorResponse(`payload validation failed: ${result.errors.join(', ')}`);
        return res.status(r.statusCode).json(r.body);
      }
    }
  }

  let occurredAt: Date | undefined;
  if (occurred_at !== undefined) {
    try {
      occurredAt = parseLocalDateTime(occurred_at);
    } catch (e: any) {
      const r = errorResponse(e.message, 400);
      return res.status(400).json(r.body);
    }
  }

  const updated = await prisma.checkin.update({
    where: { id },
    data: {
      ...(template_id !== undefined && { templateId }),
      ...(occurredAt !== undefined && { occurredAt }),
      ...(payload !== undefined && { payload: JSON.stringify(payload) }),
      updatedAt: new Date(),
      ...(tag_ids !== undefined && {
        checkinTags: {
          deleteMany: {},
          create: (tag_ids as number[]).map((tid) => ({ tagId: Number(tid) })),
        },
      }),
    },
    include: includeRelations,
  });
  const r = successResponse(toDict(updated));
  res.status(r.statusCode).json(r.body);
});

// DELETE /:checkinId
router.delete('/:checkinId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const id = Number(req.params.checkinId);

  const checkin = await prisma.checkin.findFirst({ where: { id, userId } });
  if (!checkin) {
    const r = errorResponse('checkin not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  await prisma.checkin.delete({ where: { id } });
  const r = successResponse(null);
  res.status(r.statusCode).json(r.body);
});

export const checkinRouter = router;
export default router;
