import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { validateQueryParams, escapeLikePattern, applyKeywordFilter } from '../utils/validateQuery.js';
import { validateFieldsSchema, injectDefaultField } from '../services/template-validator.js';

const router = Router();

function toDict(t: any) {
  return {
    id: Number(t.id),
    user_id: Number(t.userId),
    name: t.name,
    icon: t.icon ?? null,
    fields_schema: JSON.parse(t.fieldsSchema),
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

// GET /
router.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);

  const ALLOWED = ['keyword'] as const;
  const unknown = validateQueryParams(req.query, ALLOWED);
  if (unknown.length) {
    const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
    return res.status(r.statusCode).json(r.body);
  }

  const where: any = { userId };
  const { keyword } = req.query;
  await applyKeywordFilter(where, keyword, 'name', { table: 'checkin_templates', column: 'name', pk: 'id', pkColumn: 'id' });

  const templates = await prisma.checkinTemplate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  const r = successResponse(templates.map(toDict));
  res.status(r.statusCode).json(r.body);
});

// POST /
router.post('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { name, icon, fields_schema } = req.body;

  if (!name || !fields_schema) {
    const r = errorResponse('name and fields_schema are required');
    return res.status(r.statusCode).json(r.body);
  }

  // Validate schema (reject if user uses reserved 'comment' key)
  const schemaResult = validateFieldsSchema(fields_schema);
  if (!schemaResult.ok) {
    const r = errorResponse(schemaResult.error!);
    return res.status(r.statusCode).json(r.body);
  }

  const existing = await prisma.checkinTemplate.findUnique({
    where: { userId_name: { userId, name } },
  });
  if (existing) {
    const r = errorResponse('template name already exists', 409);
    return res.status(r.statusCode).json(r.body);
  }

  // Inject system comment field
  const finalSchema = injectDefaultField(fields_schema);

  const now = new Date();
  const template = await prisma.checkinTemplate.create({
    data: { userId, name, icon: icon ?? null, fieldsSchema: JSON.stringify(finalSchema), createdAt: now, updatedAt: now },
  });
  const r = successResponse(toDict(template));
  res.status(r.statusCode).json(r.body);
});

// GET /:templateId
router.get('/:templateId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const id = Number(req.params.templateId);

  const template = await prisma.checkinTemplate.findFirst({ where: { id, userId } });
  if (!template) {
    const r = errorResponse('template not found', 404);
    return res.status(r.statusCode).json(r.body);
  }
  const r = successResponse(toDict(template));
  res.status(r.statusCode).json(r.body);
});

// PUT /:templateId
router.put('/:templateId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const id = Number(req.params.templateId);

  const template = await prisma.checkinTemplate.findFirst({ where: { id, userId } });
  if (!template) {
    const r = errorResponse('template not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const { name, icon, fields_schema } = req.body;

  if (name && name !== template.name) {
    const existing = await prisma.checkinTemplate.findUnique({
      where: { userId_name: { userId, name } },
    });
    if (existing) {
      const r = errorResponse('template name already exists', 409);
      return res.status(r.statusCode).json(r.body);
    }
  }

  // Validate + inject when fields_schema is provided
  let finalSchema: any = undefined;
  if (fields_schema !== undefined) {
    const schemaResult = validateFieldsSchema(fields_schema);
    if (!schemaResult.ok) {
      const r = errorResponse(schemaResult.error!);
      return res.status(r.statusCode).json(r.body);
    }
    finalSchema = injectDefaultField(fields_schema);
  }

  const updated = await prisma.checkinTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(icon !== undefined && { icon }),
      ...(finalSchema !== undefined && { fieldsSchema: JSON.stringify(finalSchema) }),
      updatedAt: new Date(),
    },
  });
  const r = successResponse(toDict(updated));
  res.status(r.statusCode).json(r.body);
});

// DELETE /:templateId
router.delete('/:templateId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const id = Number(req.params.templateId);

  const template = await prisma.checkinTemplate.findFirst({ where: { id, userId } });
  if (!template) {
    const r = errorResponse('template not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const count = await prisma.checkin.count({ where: { templateId: id } });
  if (count > 0) {
    const r = errorResponse('cannot delete template with associated checkins', 409);
    return res.status(r.statusCode).json(r.body);
  }

  await prisma.checkinTemplate.delete({ where: { id } });
  const r = successResponse(null);
  res.status(r.statusCode).json(r.body);
});

export const checkinTemplateRouter = router;
export default router;
