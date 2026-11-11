import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import '../types.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 1, message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) {
    res.status(500).json({ code: 1, message: 'JWT secret not configured' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    const rawId = payload.sub ?? payload.identity;
    if (rawId === undefined || rawId === null) {
      res.status(401).json({ code: 1, message: 'Invalid token payload' });
      return;
    }
    req.userId = Number(rawId);
    next();
  } catch {
    res.status(401).json({ code: 1, message: 'Token verification failed' });
  }
}
