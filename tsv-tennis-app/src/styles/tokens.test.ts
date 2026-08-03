import { describe, expect, it } from 'vitest';
import { buttonVariants, cardShellClass, fieldControl, stackMdClass } from './tokens';

describe('design tokens', () => {
  it('defines exactly one primary, secondary, and destructive button variant', () => {
    expect(Object.keys(buttonVariants).sort()).toEqual(['destructive', 'primary', 'secondary']);
  });

  it('uses the single Cursor Orange accent (never emerald/green) for the primary action', () => {
    expect(buttonVariants.primary).toMatch(/var\(--primary\)/);
    expect(buttonVariants.primary).not.toMatch(/emerald|green/);
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

  it('exposes a field control with the 44px touch-target contract and no hardcoded border color', () => {
    expect(fieldControl).toMatch(/min-h-\[44px\]/);
    expect(fieldControl).not.toMatch(/border-(gray|red)-/);
  });
});
