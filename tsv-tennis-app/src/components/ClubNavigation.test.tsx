/// <reference types="node" />

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const indexCss = readFileSync('src/index.css', 'utf8');

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
    expect(screen.queryByText('Arbeitsstunden')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arbeitsstunden' })).toHaveAttribute('title', 'Arbeitsstunden');
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

  it('keeps controls accessible and preserves account and logout controls', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    mocks.useAuth.mockReturnValue({
      user: { id: 'member-1', name: 'Mitglied', email: 'member@example.com', role: 'member' },
      logout,
    });

    renderNavigation();

    const links = screen.getAllByRole('link');
    const buttons = screen.getAllByRole('button');
    [...links, ...buttons].forEach((control) => {
      expect(control).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:outline-2');
    });
    expect(screen.getByText('Mitglied')).toBeInTheDocument();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /navigation einklappen/i }));
    await user.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('uses responsive visibility classes and a shared safe-area height for mobile navigation', () => {
    const { rerender } = renderNavigation();
    expect(screen.getByRole('navigation', { name: 'Clubnavigation' })).toHaveClass('hidden', 'md:flex');

    rerender(
      <MemoryRouter>
        <ClubNavigation variant="mobile" onRundmail={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Clubnavigation' })).toHaveClass('md:hidden');
    expect(indexCss.match(/env\(safe-area-inset-bottom\)/g)).toHaveLength(1);
    expect(indexCss).toContain('--club-nav-height: calc(4rem + env(safe-area-inset-bottom))');
    expect(indexCss).toContain('height: var(--club-nav-height)');
    expect(indexCss).toContain('padding-bottom: var(--club-nav-height)');
    expect(screen.getByRole('navigation', { name: 'Clubnavigation' })).not.toHaveClass('pb-[env(safe-area-inset-bottom)]');
  });

  it('provides reduced-motion CSS support', () => {
    renderNavigation();
    const navigation = screen.getByRole('navigation', { name: 'Clubnavigation' });
    expect(navigation).toHaveClass('club-navigation-motion');
    expect(indexCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.club-navigation-motion,\s*\.club-navigation-motion \*/);
  });
});
