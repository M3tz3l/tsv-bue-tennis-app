import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

describe('Login redirect after authentication', () => {
  let lastPath: string;

  const LocationProbe = () => {
    lastPath = useLocation().pathname + useLocation().search + useLocation().hash;
    return null;
  };

  const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByRole('textbox', { name: /E-Mail-Adresse/i }), 'a@b.de');
    await user.type(screen.getByLabelText('Passwort'), 'secret');
    await user.click(screen.getByRole('button', { name: /Anmelden/i }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('returns to the originally requested single-user link (with search and hash)', async () => {
    const login = vi.fn().mockResolvedValue({ success: true, multiple: false });
    mocks.useAuth.mockReturnValue({ login, user: null });
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/login', state: { from: { pathname: '/dashboard/veranstaltungen', search: '?foo=1', hash: '#abschnitt' } } }]}
      >
        <Login />
        <LocationProbe />
      </MemoryRouter>
    );

    await fillAndSubmit(user);
    await waitFor(() => expect(lastPath).toBe('/dashboard/veranstaltungen?foo=1#abschnitt'));
  });

  it('returns to the originally requested link after member selection', async () => {
    const login = vi.fn().mockResolvedValue({
      success: true,
      multiple: true,
      users: [{ id: 'member-1', name: 'Mitglied 1' }],
      selectionToken: 'token',
    });
    const selectMember = vi.fn().mockResolvedValue({ success: true });
    mocks.useAuth.mockReturnValue({ login, selectMember, user: null });
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/login', state: { from: { pathname: '/dashboard/arbeitsstunden', search: '?jahr=2026', hash: '' } } }]}
      >
        <Login />
        <LocationProbe />
      </MemoryRouter>
    );

    await fillAndSubmit(user);
    await waitFor(() => expect(screen.getByText('Mitglied 1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Mitglied 1/i }));
    await waitFor(() => expect(lastPath).toBe('/dashboard/arbeitsstunden?jahr=2026'));
  });

  it('falls back to /dashboard when no destination was provided', async () => {
    const login = vi.fn().mockResolvedValue({ success: true, multiple: false });
    mocks.useAuth.mockReturnValue({ login, user: null });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
        <LocationProbe />
      </MemoryRouter>
    );

    await fillAndSubmit(user);
    await waitFor(() => expect(lastPath).toBe('/dashboard'));
  });
});
