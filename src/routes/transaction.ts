import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { validateQueryParams, escapeLikePattern, applyKeywordFilter } from '../utils/validateQuery.js';
import { parseLocalDateTime, parseLocalDateRange } from '../utils/datetime.js';

export const transactionRouter = Router();

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

function categoryToDict(c: any) {
  if (!c) return null;
  return {
    category_id: Number(c.categoryId),
    user_id: Number(c.userId),
    category_name: c.categoryName,
    category_type: c.categoryType,
    icon: c.icon ?? null,
    color: c.color ?? null,
    created_at: (c.createdAt as Date).toISOString(),
  };
}

function transactionToDict(t: any) {
  return {
    transaction_id: Number(t.transactionId),
    user_id: Number(t.userId),
    category_id: Number(t.categoryId),
    category: t.category ? categoryToDict(t.category) : null,
    amount: t.amount.toString(),
    transaction_type: t.transactionType,
    transaction_date: (t.transactionDate as Date).toISOString(),
    description: t.description ?? null,
    images: t.images ?? null,
    tags: (t.transactionTags ?? []).map((tt: any) => tagToDict(tt.tag)),
    created_at: (t.createdAt as Date).toISOString(),
    updated_at: (t.updatedAt as Date).toISOString(),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/transactions/summary  — must be registered before /:transactionId
transactionRouter.get('/summary', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { start_date, end_date } = req.query;

  let dateFilter: { gte?: Date; lte?: Date };
  try {
    dateFilter = parseLocalDateRange(start_date, end_date);
  } catch (e: any) {
    const r = errorResponse(e.message, 400);
    return res.status(400).json(r.body);
  }

  const baseWhere: any = { userId };
  if (Object.keys(dateFilter).length) baseWhere.transactionDate = dateFilter;

  const [incomeResult, expenseResult] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...baseWhere, transactionType: 'income' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...baseWhere, transactionType: 'expense' },
      _sum: { amount: true },
    }),
  ]);

  const incomeStr = incomeResult._sum.amount?.toString() ?? '0.00';
  const expenseStr = expenseResult._sum.amount?.toString() ?? '0.00';
  const balance = (parseFloat(incomeStr) - parseFloat(expenseStr)).toFixed(2);

  const r = successResponse({ income: incomeStr, expense: expenseStr, balance });
  res.status(r.statusCode).json(r.body);
});

// GET /api/transactions
transactionRouter.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);

  const ALLOWED = ['type', 'category_id', 'start_date', 'end_date', 'tag_id', 'keyword', 'page', 'per_page'] as const;
  const unknown = validateQueryParams(req.query, ALLOWED);
  if (unknown.length) {
    const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
    return res.status(r.statusCode).json(r.body);
  }

  const { type, category_id, start_date, end_date, tag_id, keyword } = req.query;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.max(1, Number(req.query.per_page ?? 20));
  const skip = (page - 1) * perPage;

  const where: any = { userId };
  if (type) where.transactionType = type;
  if (category_id) where.categoryId = Number(category_id as string);
  if (tag_id) where.transactionTags = { some: { tagId: Number(tag_id as string) } };

  let dateFilter: { gte?: Date; lte?: Date };
  try {
    dateFilter = parseLocalDateRange(start_date, end_date);
  } catch (e: any) {
    const r = errorResponse(e.message, 400);
    return res.status(400).json(r.body);
  }
  if (Object.keys(dateFilter).length) where.transactionDate = dateFilter;

  await applyKeywordFilter(where, keyword, 'description', { table: 'transactions', column: 'description', pk: 'transactionId', pkColumn: 'transaction_id' });

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { category: true, transactionTags: { include: { tag: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: perPage,
    }),
  ]);

  const pages = Math.ceil(total / perPage);
  const r = successResponse({
    items: transactions.map(transactionToDict),
    total,
    page,
    per_page: perPage,
    pages,
  });
  res.status(r.statusCode).json(r.body);
});

// POST /api/transactions
transactionRouter.post('/', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const { amount, transaction_type, category_id, transaction_date, description, images, tag_ids } =
    req.body;

  if (amount == null || !transaction_type || !category_id || !transaction_date) {
    const r = errorResponse('amount, transaction_type, category_id, transaction_date are required');
    return res.status(r.statusCode).json(r.body);
  }
  if (!['income', 'expense'].includes(transaction_type)) {
    const r = errorResponse('transaction_type must be income or expense');
    return res.status(r.statusCode).json(r.body);
  }

  const tagIdsBigInt: number[] = (tag_ids ?? []).map((id: any) => Number(id));
  const now = new Date();

  let transactionDate: Date;
  try {
    transactionDate = parseLocalDateTime(transaction_date);
  } catch (e: any) {
    const r = errorResponse(e.message, 400);
    return res.status(400).json(r.body);
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      categoryId: Number(category_id),
      amount,
      transactionType: transaction_type,
      transactionDate,
      description: description ?? null,
      images: images ?? null,
      createdAt: now,
      updatedAt: now,
      transactionTags: tagIdsBigInt.length > 0
        ? { create: tagIdsBigInt.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: { category: true, transactionTags: { include: { tag: true } } },
  });

  const r = successResponse(transactionToDict(transaction));
  res.status(201).json(r.body);
});

// GET /api/transactions/:transactionId
transactionRouter.get('/:transactionId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const transactionId = Number(req.params.transactionId);

  const transaction = await prisma.transaction.findFirst({
    where: { transactionId, userId },
    include: { category: true, transactionTags: { include: { tag: true } } },
  });
  if (!transaction) {
    const r = errorResponse('transaction not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const r = successResponse(transactionToDict(transaction));
  res.status(r.statusCode).json(r.body);
});

// PUT /api/transactions/:transactionId
transactionRouter.put('/:transactionId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const transactionId = Number(req.params.transactionId);

  const transaction = await prisma.transaction.findFirst({ where: { transactionId, userId } });
  if (!transaction) {
    const r = errorResponse('transaction not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  const { amount, transaction_type, category_id, transaction_date, description, images, tag_ids } =
    req.body;

  if (transaction_type !== undefined && !['income', 'expense'].includes(transaction_type)) {
    const r = errorResponse('transaction_type must be income or expense');
    return res.status(r.statusCode).json(r.body);
  }

  const updateData: any = { updatedAt: new Date() };
  if (amount !== undefined) updateData.amount = amount;
  if (transaction_type !== undefined) updateData.transactionType = transaction_type;
  if (category_id !== undefined) updateData.categoryId = Number(category_id);
  if (transaction_date !== undefined) {
    try {
      updateData.transactionDate = parseLocalDateTime(transaction_date);
    } catch (e: any) {
      const r = errorResponse(e.message, 400);
      return res.status(400).json(r.body);
    }
  }
  if (description !== undefined) updateData.description = description;
  if (images !== undefined) updateData.images = images;
  if (tag_ids !== undefined) {
    const newTagIds: number[] = (tag_ids as any[]).map((id: any) => Number(id));
    updateData.transactionTags = {
      deleteMany: {},
      create: newTagIds.map((tagId) => ({ tagId })),
    };
  }

  const updated = await prisma.transaction.update({
    where: { transactionId },
    data: updateData,
    include: { category: true, transactionTags: { include: { tag: true } } },
  });

  const r = successResponse(transactionToDict(updated));
  res.status(r.statusCode).json(r.body);
});

// DELETE /api/transactions/:transactionId
transactionRouter.delete('/:transactionId', async (req: Request, res: Response) => {
  const userId = Number(req.userId!);
  const transactionId = Number(req.params.transactionId);

  const transaction = await prisma.transaction.findFirst({ where: { transactionId, userId } });
  if (!transaction) {
    const r = errorResponse('transaction not found', 404);
    return res.status(r.statusCode).json(r.body);
  }

  await prisma.transaction.delete({ where: { transactionId } });

  const r = successResponse(null);
  res.status(r.statusCode).json(r.body);
});
