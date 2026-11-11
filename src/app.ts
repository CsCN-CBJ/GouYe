import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './prisma.js';
import { authMiddleware } from './middleware/auth.js';
import { userRouter } from './routes/user.js';
import { tagRouter } from './routes/tag.js';
import { categoryRouter } from './routes/category.js';
import { projectRouter } from './routes/project.js';
import { todoRouter } from './routes/todo.js';
import { transactionRouter } from './routes/transaction.js';
import { checkinRouter } from './routes/checkin.js';
import { checkinTemplateRouter } from './routes/checkin-template.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/users', userRouter);
app.use('/api/tags', authMiddleware, tagRouter);
app.use('/api/categories', authMiddleware, categoryRouter);
app.use('/api/projects', authMiddleware, projectRouter);
app.use('/api/todos', authMiddleware, todoRouter);
app.use('/api/transactions', authMiddleware, transactionRouter);
app.use('/api/checkins', authMiddleware, checkinRouter);
app.use('/api/checkin-templates', authMiddleware, checkinTemplateRouter);

// Static frontend — new PC frontend as main
const frontendPcDir = path.resolve(__dirname, '../frontend-pc');
app.use(express.static(frontendPcDir));

// Legacy mobile frontend at /legacy/
const frontendLegacyDir = path.resolve(__dirname, '../frontend');
app.use('/legacy', express.static(frontendLegacyDir));

// SPA fallback — non-API routes return new frontend index.html
app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendPcDir, 'index.html'));
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ code: 1, message: 'Internal server error' });
});

export { app };

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 7001;
  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
  });
}
