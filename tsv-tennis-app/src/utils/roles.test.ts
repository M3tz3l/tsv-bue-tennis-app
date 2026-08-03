import { describe, expect, it } from 'vitest';
import { isOrgaRole } from './roles';

describe('isOrgaRole', () => {
  it('normalizes whitespace and case', () => {
    expect(isOrgaRole(' ORGA ')).toBe(true);
    expect(isOrgaRole('member')).toBe(false);
    expect(isOrgaRole(undefined)).toBe(false);
  });
});
