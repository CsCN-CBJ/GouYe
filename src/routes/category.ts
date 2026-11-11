import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { validateQueryParams, escapeLikePattern, applyKeywordFilter } from '../utils/validateQuery.js';

export const categoryRouter = Router();

function categoryToDict(cat: {
  categoryId: number;
  userId: number | null;
  categoryName: string;
  categoryType: string;
  icon: string | null;
  color: string | null;
  createdAt: Date;
}) {
  return {
    category_id: Number(cat.categoryId),
    user_id: cat.userId !== null ? Number(cat.userId) : null,
    category_name: cat.categoryName,
    category_type: cat.categoryType,
    icon: cat.icon,
    color: cat.color,
    created_at: cat.createdAt.toISOString(),
  };
}

const VALID_TYPES = ['income', 'expense'];

// GET /
categoryRouter.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);

  const ALLOWED = ['type', 'keyword'] as const;
  const unknown = validateQueryParams(req.query, ALLOWED);
  if (unknown.length) {
    const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
    return res.status(r.statusCode).json(r.body);
  }

  const { type, keyword } = req.query;

  const where: Record<string, unknown> = { userId };
  if (type) {
    if (!VALID_TYPES.includes(type as string)) {
      const r = errorResponse('type must be income or expense', 400);
      res.status(r.statusCode).json(r.body);
      return;
    }
    where.categoryType = type;
  }

  await applyKeywordFilter(where, keyword, 'categoryName', { table: 'categories', column: 'category_name', pk: 'categoryId', pkColumn: 'category_id' });

  const categories = await prisma.category.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
  const r = successResponse(categories.map(categoryToDict));
  res.status(r.statusCode).json(r.body);
});

// POST /
categoryRouter.post('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { category_name, category_type, icon, color } = req.body;

  if (!category_name || !category_type) {
    const r = errorResponse('category_name and category_type are required', 400);
    res.status(r.statusCode).json(r.body);
    return;
  }
  if (!VALID_TYPES.includes(category_type)) {
    const r = errorResponse('category_type must be income or expense', 400);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const category = await prisma.category.create({
    data: {
      userId,
      categoryName: category_name,
      categoryType: category_type,
      icon: icon ?? null,
      color: color ?? null,
    },
  });
  const r = successResponse(categoryToDict(category));
  res.status(r.statusCode).json(r.body);
});

// PUT /:categoryId
categoryRouter.put('/:categoryId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const categoryId = Number(req.params.categoryId);
  const { category_name, icon, color } = req.body;

  const category = await prisma.category.findUnique({ where: { categoryId } });
  if (!category) {
    const r = errorResponse('category not found', 404);
    res.status(r.statusCode).json(r.body);
    return;
  }
  if (category.userId !== userId) {
    const r = errorResponse('cannot modify public category', 403);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const updated = await prisma.category.update({
    where: { categoryId },
    data: {
      ...(category_name !== undefined && { categoryName: category_name }),
      ...(icon !== undefined && { icon }),
      ...(color !== undefined && { color }),
    },
  });
  const r = successResponse(categoryToDict(updated));
  res.status(r.statusCode).json(r.body);
});

// DELETE /:categoryId
categoryRouter.delete('/:categoryId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const categoryId = Number(req.params.categoryId);

  const category = await prisma.category.findUnique({ where: { categoryId } });
  if (!category) {
    const r = errorResponse('category not found', 404);
    res.status(r.statusCode).json(r.body);
    return;
  }
  if (category.userId !== userId) {
    const r = errorResponse('cannot modify public category', 403);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const txCount = await prisma.transaction.count({ where: { categoryId } });
  if (txCount > 0) {
    const r = errorResponse('cannot delete category with associated transactions', 409);
    res.status(r.statusCode).json(r.body);
    return;
  }

  await prisma.category.delete({ where: { categoryId } });
  const r = successResponse(null);
  res.status(r.statusCode).json(r.body);
});
