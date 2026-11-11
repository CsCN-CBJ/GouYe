// 写死 +08:00 字面量，不读 process.env.TZ
export function parseLocalDateTime(input: unknown): Date {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('datetime must be a non-empty string');
  }
  const s = input.trim();
  // 已带时区（Z / ±HH:MM / ±HHMM）→ 直接交给 Date
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid datetime: ${input}`);
    return d;
  }
  // 裸串 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm[:ss]：按 +08:00 解释
  const dateOnly = s.match(/^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))$/);
  if (dateOnly) {
    const d = new Date(`${dateOnly[1]}T00:00:00+08:00`);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid datetime: ${input}`);
    return d;
  }
  const dateTime = s.match(/^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (!dateTime) throw new Error(`invalid datetime format: ${input}`);
  const d = new Date(`${dateTime[1]}T${dateTime[2]}+08:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid datetime: ${input}`);
  return d;
}

// 用于 start_date/end_date 这种"日期窗口"，end_date 自动推到当天 23:59:59 +08:00
export function parseLocalDateRange(start: unknown, end: unknown): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  if (typeof start === 'string' && start) {
    out.gte = new Date(`${start}T00:00:00+08:00`);
    if (Number.isNaN(out.gte.getTime())) throw new Error(`invalid start_date: ${start}`);
  }
  if (typeof end === 'string' && end) {
    out.lte = new Date(`${end}T23:59:59+08:00`);
    if (Number.isNaN(out.lte.getTime())) throw new Error(`invalid end_date: ${end}`);
  }
  return out;
}
