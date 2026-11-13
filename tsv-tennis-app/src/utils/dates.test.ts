import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPast } from './dates';

describe('isPast', () => {
  afterEach(() => vi.useRealTimers());

  it('treats date-only values as Berlin calendar dates', () => {
    vi.useFakeTimers();

    // 00:30 UTC = 01:30 Berlin on 1 Jan: the 1st is still current.
    vi.setSystemTime(new Date('2026-01-01T00:30:00Z'));
    expect(isPast('2026-01-01')).toBe(false);
    expect(isPast('2025-12-31')).toBe(true);

    // 23:30 UTC = 00:30 Berlin on 2 Jan: the 1st is now past.
    vi.setSystemTime(new Date('2026-01-01T23:30:00Z'));
    expect(isPast('2026-01-01')).toBe(true);
    expect(isPast('2026-01-02')).toBe(false);
  });

  it('compares timestamp values as instants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));

    expect(isPast('2026-01-01T11:00:00Z')).toBe(true);
    expect(isPast('2026-01-01T13:00:00Z')).toBe(false);
  });
});
