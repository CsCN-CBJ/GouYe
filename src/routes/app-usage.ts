import { createHash } from 'node:crypto';
import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { errorResponse, successResponse } from '../utils.js';
import { formatBeijingDateTime, parseLocalDateTime } from '../utils/datetime.js';
import { validateQueryParams } from '../utils/validateQuery.js';

const router = Router();
const dayMillis = 24 * 60 * 60 * 1000;
const devicePattern = /^[A-Za-z0-9_-]{1,80}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?\+08:00$/;

interface UsageSession {
  packageName: string;
  appName: string;
  startedAt: Date;
  endedAt: Date;
}

function sendError(res: Response, message: string, status = 400) {
  const result = errorResponse(message, status);
  return res.status(result.statusCode).json(result.body);
}

function sendData(res: Response, data: unknown) {
  const result = successResponse(data);
  return res.status(result.statusCode).json(result.body);
}

function dayStart(value: unknown): Date {
  if (typeof value !== 'string' || !datePattern.test(value)) throw new Error('日期应为 YYYY-MM-DD');
  const day = parseLocalDateTime(value);
  if (formatBeijingDateTime(day).slice(0, 10) !== value) throw new Error('日期无效');
  return day;
}

function parseUsageTime(value: unknown): Date {
  if (typeof value !== 'string' || !timePattern.test(value)) {
    throw new Error('使用时间应为带 +08:00 的日期时间');
  }
  const time = parseLocalDateTime(value);
  if (formatBeijingDateTime(time).slice(0, 19) !== value.slice(0, 19)) {
    throw new Error('使用时间无效');
  }
  return time;
}

function takeSessions(input: unknown, day: Date): UsageSession[] {
  if (!Array.isArray(input) || !input.length) throw new Error('需要有实际使用记录的当天明细');
  const from = day.getTime();
  const until = from + dayMillis;
  let lastEnd = from;
  return input.map((record: unknown) => {
    const row = record as { package_name?: unknown; app_name?: unknown; started_at?: unknown; ended_at?: unknown } | null;
    if (!row || typeof row.package_name !== 'string' || !row.package_name.trim() || row.package_name.length > 255
        || typeof row.app_name !== 'string' || !row.app_name.trim() || row.app_name.length > 255) {
      throw new Error('应用名称或包名无效');
    }
    const startedAt = parseUsageTime(row.started_at);
    const endedAt = parseUsageTime(row.ended_at);
    if (startedAt.getTime() < lastEnd || endedAt <= startedAt || endedAt.getTime() > until) {
      throw new Error('时间段必须按顺序排列、互不重叠，并归入同一个北京时间日');
    }
    lastEnd = endedAt.getTime();
    return { packageName: row.package_name, appName: row.app_name, startedAt, endedAt };
  });
}

function dayDict(day: {
  deviceId: string; date: string; revision: number; durationMs: number; syncedAt: Date;
}) {
  return {
    device_id: day.deviceId,
    date: day.date,
    revision: day.revision,
    duration_ms: day.durationMs,
    synced_at: formatBeijingDateTime(day.syncedAt),
  };
}

function scope(req: Request) {
  const { deviceId, date } = req.params;
  if (!devicePattern.test(deviceId)) throw new Error('设备标识无效');
  const start = dayStart(date);
  return { key: { userId: Number(req.userId), deviceId, date }, start };
}

router.put('/devices/:deviceId/days/:date', async (req, res, next) => {
  let upload;
  try {
    const { key, start } = scope(req);
    const revision: unknown = req.body?.revision;
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || revision > 2_147_483_647) {
      throw new Error('当天版本号无效');
    }
    const sessions = takeSessions(req.body?.sessions, start);
    const digest = createHash('sha256').update(JSON.stringify(sessions)).digest('hex');
    const durationMs = sessions.reduce((total, row) => total + row.endedAt.getTime() - row.startedAt.getTime(), 0);
    upload = { key, revision, sessions, digest, durationMs };
  } catch (error) {
    return sendError(res, (error as Error).message);
  }
  const { key, revision, sessions, digest, durationMs } = upload;
  try {
    const result = await prisma.$transaction(async tx => {
      const values = { revision, digest, durationMs, syncedAt: new Date() };
      // Take the SQLite writer lock before reading the current revision.
      const changed = await tx.appUsageDay.updateMany({ where: { ...key, revision: { lt: revision } }, data: values });
      let day = await tx.appUsageDay.findUnique({ where: { userId_deviceId_date: key } });
      if (day && changed.count === 0) {
        if (day.revision > revision) return { status: 'stale', ...dayDict(day) };
        return { status: day.digest === digest ? 'duplicate' : 'conflict', ...dayDict(day) };
      }
      if (day) {
        await tx.appUsageSession.deleteMany({ where: { dayId: day.id } });
      } else {
        day = await tx.appUsageDay.create({ data: { ...key, ...values } });
      }
      await tx.appUsageSession.createMany({ data: sessions.map(row => ({ ...row, dayId: day.id })) });
      return { status: 'applied', ...dayDict(day) };
    });
    if (result.status === 'conflict') return sendError(res, '同一版本对应了不同明细', 409);
    return sendData(res, result);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P1008' || code === 'P2034') return sendError(res, '写入繁忙，请重试', 503);
    return next(error);
  }
});

router.get('/days', async (req, res, next) => {
  const unknown = validateQueryParams(req.query, ['from', 'to', 'device_id']);
  if (unknown.length) return sendError(res, '包含未知的筛选项');
  const { from, to, device_id: deviceId } = req.query;
  try {
    if (dayStart(to) < dayStart(from)) return sendError(res, '截止日期早于开始日期');
    if (deviceId !== undefined && (typeof deviceId !== 'string' || !devicePattern.test(deviceId))) {
      return sendError(res, '设备标识无效');
    }
  } catch (error) {
    return sendError(res, (error as Error).message);
  }
  try {
    const days = await prisma.appUsageDay.findMany({
      where: {
        userId: Number(req.userId),
        deviceId: deviceId as string | undefined,
        date: { gte: from as string, lte: to as string },
      },
      orderBy: [{ date: 'desc' }, { deviceId: 'asc' }],
    });
    return sendData(res, days.map(dayDict));
  } catch (error) {
    return next(error);
  }
});

router.get('/devices/:deviceId/days/:date', async (req, res, next) => {
  let selection;
  try {
    selection = scope(req);
  } catch (error) {
    return sendError(res, (error as Error).message);
  }
  try {
    const day = await prisma.appUsageDay.findUnique({
      where: { userId_deviceId_date: selection.key },
      include: { sessions: { orderBy: { startedAt: 'asc' } } },
    });
    if (!day) return sendError(res, '当天没有同步记录', 404);
    const byApp = new Map<string, { package_name: string; app_name: string; duration_ms: number }>();
    const sessions = day.sessions.map(row => {
      const duration = row.endedAt.getTime() - row.startedAt.getTime();
      const previous = byApp.get(row.packageName);
      byApp.set(row.packageName, {
        package_name: row.packageName, app_name: row.appName, duration_ms: (previous?.duration_ms ?? 0) + duration,
      });
      return {
        package_name: row.packageName,
        app_name: row.appName,
        started_at: formatBeijingDateTime(row.startedAt),
        ended_at: formatBeijingDateTime(row.endedAt),
        duration_ms: duration,
      };
    });
    const appRank = [...byApp.values()].sort((a, b) =>
      b.duration_ms - a.duration_ms || a.package_name.localeCompare(b.package_name));
    return sendData(res, { ...dayDict(day), apps: appRank, sessions });
  } catch (error) {
    return next(error);
  }
});

export { router as appUsageRouter };
