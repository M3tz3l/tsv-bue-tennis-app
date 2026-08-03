import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));

import ClubNavigation from './ClubNavigation';

const renderNavigation = (initialEntry = '/dashboard/arbeitsstunden') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <ClubNavigation variant="desktop" onRundmail={vi.fn()} />
  </MemoryRouter>,
);

describe('ClubNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { id: 'member-1', name: 'Mitglied', email: 'member@example.com', role: 'member' },
      logout: vi.fn(),
    });
  });

  it('renders the club routes and marks the current route as active', () => {
    renderNavigation();

    expect(screen.getByRole('link', { name: 'Übersicht' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Arbeitsstunden' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Veranstaltungen' })).toHaveAttribute('href', '/dashboard/veranstaltungen');
  });

  it('shows Rundmail only for a normalized Orga role and calls its explicit callback', async () => {
    const user = userEvent.setup();
    const onRundmail = vi.fn();
    mocks.useAuth.mockReturnValue({
      user: { id: 'orga-1', name: 'Orga', email: 'orga@example.com', role: ' ORGA ' },
      logout: vi.fn(),
    });

    const { rerender } = render(
      <MemoryRouter>
        <ClubNavigation variant="desktop" onRundmail={onRundmail} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /rundmail/i }));
    expect(onRundmail).toHaveBeenCalledOnce();

    mocks.useAuth.mockReturnValue({
      user: { id: 'member-1', name: 'Mitglied', email: 'member@example.com', role: ' member ' },
      logout: vi.fn(),
    });
    rerender(
      <MemoryRouter>
        <ClubNavigation variant="desktop" onRundmail={onRundmail} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /rundmail/i })).not.toBeInTheDocument();
  });

  it('toggles the expanded state with a labeled collapse button', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const collapseButton = screen.getByRole('button', { name: /navigation einklappen/i });
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(collapseButton);

    expect(screen.getByRole('button', { name: /navigation erweitern/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the mobile navigation variant with the same route semantics', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/veranstaltungen']}>
        <ClubNavigation variant="mobile" onRundmail={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Clubnavigation' })).toHaveClass('club-navigation-mobile');
    expect(screen.getByRole('link', { name: 'Veranstaltungen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: /navigation einklappen/i })).not.toBeInTheDocument();
  });
});
