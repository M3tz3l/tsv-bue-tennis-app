import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWorkHourYearEditable } from './utils';

describe('isWorkHourYearEditable', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the previous year editable during January', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    expect(isWorkHourYearEditable(2026)).toBe(true);
    expect(isWorkHourYearEditable(2025)).toBe(true);
    expect(isWorkHourYearEditable(2024)).toBe(false);
  });

  it('closes the previous year from February', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));

    expect(isWorkHourYearEditable(2026)).toBe(true);
    expect(isWorkHourYearEditable(2025)).toBe(false);
  });

  it('uses the club timezone for the month boundary', () => {
    vi.useFakeTimers();
    // 00:30 UTC on 1 Feb is already February in Berlin.
    vi.setSystemTime(new Date('2026-02-01T00:30:00Z'));

    expect(isWorkHourYearEditable(2025)).toBe(false);
  });
});
