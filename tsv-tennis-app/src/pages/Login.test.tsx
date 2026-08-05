import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));

import Login from './Login';

// Default: no hover support (so mouse handlers are inactive and we test the
// keyboard path deterministically).
const setup = (hover = false) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(hover: hover)' ? hover : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
};

describe('Login password hint tooltip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      login: vi.fn(),
      user: null,
    });
  });

  it('opens the hint on click and closes it when focus leaves the hint container', async () => {
    setup();
    const user = userEvent.setup();
    render(<MemoryRouter><Login /></MemoryRouter>);

    const trigger = screen.getByRole('button', { name: /Passwort-Hinweis anzeigen/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(screen.getByRole('button', { name: /Hinweis schließen/i })).toBeInTheDocument();

    // Tab moves focus to the password input, which is outside the hint
    // container, so the hint closes.
    await user.tab();
    expect(screen.queryByRole('button', { name: /Hinweis schließen/i })).not.toBeInTheDocument();
  });

  it('closes the hint via its close button', async () => {
    setup();
    const user = userEvent.setup();
    render(<MemoryRouter><Login /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /Passwort-Hinweis anzeigen/i }));
    await user.click(screen.getByRole('button', { name: /Hinweis schließen/i }));

    expect(screen.queryByRole('button', { name: /Hinweis schließen/i })).not.toBeInTheDocument();
  });
});
