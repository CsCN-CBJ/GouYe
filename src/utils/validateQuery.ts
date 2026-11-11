import prisma from '../prisma.js';

export function validateQueryParams(query: Record<string, any>, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed);
  return Object.keys(query).filter((k) => !allowedSet.has(k));
}

export function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, c => '\\' + c);
}

// SQLite 下 Prisma 的 contains 生成的 LIKE 不带 ESCAPE，`%`/`_`/`\` 无法字面匹配。
// 含这些字符的 keyword 改用手写 LIKE ... ESCAPE 查出匹配行 ID，再叠加到 where 上。
export interface KeywordTarget {
  table: string;     // 表名（snake_case）
  column: string;    // 搜索列名（snake_case）
  pk: string;        // Prisma 主键属性名
  pkColumn: string;  // 主键列名
}

export async function applyKeywordFilter(
  where: any,
  keyword: unknown,
  fieldName: string,
  target?: KeywordTarget,
): Promise<void> {
  if (typeof keyword !== 'string' || !keyword.trim()) return;
  const k = keyword.trim();
  if (!target || !/[\\%_]/.test(k)) {
    where[fieldName] = { contains: k };
    return;
  }
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT ${target.pkColumn} AS id FROM ${target.table} WHERE ${target.column} LIKE ? ESCAPE '\\'`,
    `%${escapeLikePattern(k)}%`,
  );
  where[target.pk] = { in: rows.map((r) => r.id) };
}
