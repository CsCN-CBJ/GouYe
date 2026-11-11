import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import { successResponse, errorResponse } from '../utils.js';
import { authMiddleware } from '../middleware/auth.js';

export const userRouter = Router();

function userToDict(user: { userId: number; username: string; createdAt: Date }) {
  return {
    user_id: Number(user.userId),
    username: user.username,
    created_at: user.createdAt.toISOString(),
  };
}

// POST /register
userRouter.post('/register', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    const r = errorResponse('username and password are required', 400);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    const r = errorResponse('username already exists', 409);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { username, passwordHash } });
  const r = successResponse(userToDict(user));
  res.status(r.statusCode).json(r.body);
});

// POST /login
userRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    const r = errorResponse('username and password are required', 400);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    const r = errorResponse('invalid credentials', 401);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const r = errorResponse('invalid credentials', 401);
    res.status(r.statusCode).json(r.body);
    return;
  }

  const secret = process.env.JWT_SECRET_KEY!;
  const token = jwt.sign({ sub: user.userId.toString() }, secret, { expiresIn: '7d' });
  const r = successResponse({ token, user: userToDict(user) });
  res.status(r.statusCode).json(r.body);
});

// GET /me
userRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { userId: Number(req.userId!) } });
  if (!user) {
    const r = errorResponse('user not found', 404);
    res.status(r.statusCode).json(r.body);
    return;
  }
  const r = successResponse(userToDict(user));
  res.status(r.statusCode).json(r.body);
});
