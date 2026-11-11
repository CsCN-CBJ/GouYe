import { describe, it, expect, vi } from 'vitest';
import { parseLocalDateTime, parseLocalDateRange } from '../src/utils/datetime.js';

describe('parseLocalDateTime', () => {
  it('U1: bare datetime (no TZ) → treated as +08:00', () => {
    const d = parseLocalDateTime('2026-06-18T22:00:00');
    expect(d.toISOString()).toBe('2026-06-18T14:00:00.000Z');
  });

  it('U2: datetime with Z suffix → kept as-is', () => {
    const d = parseLocalDateTime('2026-06-18T14:00:00Z');
    expect(d.toISOString()).toBe('2026-06-18T14:00:00.000Z');
  });

  it('U3: datetime with +08:00 offset → correct UTC', () => {
    const d = parseLocalDateTime('2026-06-18T22:00:00+08:00');
    expect(d.toISOString()).toBe('2026-06-18T14:00:00.000Z');
  });

  it('U4: date-only string → midnight +08:00', () => {
    const d = parseLocalDateTime('2026-06-18');
    expect(d.toISOString()).toBe('2026-06-17T16:00:00.000Z');
  });

  it('U5: invalid string throws', () => {
    expect(() => parseLocalDateTime('not-a-date')).toThrow();
  });

  it('U6: empty / null / undefined throws', () => {
    expect(() => parseLocalDateTime('')).toThrow();
    expect(() => parseLocalDateTime(null)).toThrow();
    expect(() => parseLocalDateTime(undefined)).toThrow();
  });
});

describe('parseLocalDateRange', () => {
  it('U7: same start & end date → gte midnight +08:00, lte 23:59:59 +08:00', () => {
    const range = parseLocalDateRange('2026-06-18', '2026-06-18');
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeInstanceOf(Date);
    expect(range.gte!.toISOString()).toBe('2026-06-17T16:00:00.000Z');
    expect(range.lte!.toISOString()).toBe('2026-06-18T15:59:59.000Z');
  });
});

describe('parseLocalDateTime — process.env.TZ independence', () => {
  it('U8: result unchanged with TZ=UTC', () => {
    vi.stubEnv('TZ', 'UTC');
    try {
      const d = parseLocalDateTime('2026-06-18T22:00:00');
      expect(d.toISOString()).toBe('2026-06-18T14:00:00.000Z');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
