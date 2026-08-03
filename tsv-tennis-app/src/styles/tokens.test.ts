import { describe, expect, it } from 'vitest';
import { buttonVariants, cardShellClass, stackMdClass } from './tokens';

describe('design tokens', () => {
  it('defines exactly one primary, secondary, and destructive button variant', () => {
    expect(Object.keys(buttonVariants).sort()).toEqual(['destructive', 'primary', 'secondary']);
  });

  it('uses emerald-700 or green-700 (not the 600 shade) for the primary action to meet contrast requirements', () => {
    expect(buttonVariants.primary).toMatch(/bg-(emerald|green)-700/);
    expect(buttonVariants.primary).not.toMatch(/bg-(emerald|green)-600(?!\d)/);
  });

  it('gives every variant the shared touch target class', () => {
    Object.values(buttonVariants).forEach((variant) => {
      expect(variant).toMatch(/action-control/);
    });
  });

  it('exposes card and stack layout classes', () => {
    expect(cardShellClass).toBe('card-shell');
    expect(stackMdClass).toBe('stack-md');
  });
});
