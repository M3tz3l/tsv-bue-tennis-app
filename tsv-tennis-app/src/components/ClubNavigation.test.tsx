/// <reference types="node" />

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

  it('keeps Orga and logout controls named when their labels are visually collapsed', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    mocks.useAuth.mockReturnValue({
      user: { id: 'orga-1', name: 'Orga', email: 'orga@example.com', role: 'orga' },
      logout,
    });

    renderNavigation();
    await user.click(screen.getByRole('button', { name: /navigation einklappen/i }));

    expect(screen.getByRole('button', { name: 'Rundmail' })).not.toHaveTextContent('Rundmail');
    expect(screen.getByRole('button', { name: 'Rundmail' })).toHaveAttribute('title', 'Rundmail');
    expect(screen.getByRole('button', { name: 'Abmelden' })).not.toHaveTextContent('Abmelden');
    expect(screen.getByRole('button', { name: 'Abmelden' })).toHaveAttribute('title', 'Abmelden');
    expect(screen.queryByText('Orga')).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Übersicht' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Arbeitsstunden' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Veranstaltungen' })).toBeVisible();
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
      expect(control).toHaveClass('touch-control', 'focus-visible:outline-2');
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
    const navigation = screen.getByRole('navigation', { name: 'Clubnavigation' });
    expect(navigation).toHaveClass('md:hidden');
    expect(navigation).toHaveAttribute('data-variant', 'mobile');
    expect(navigation).toHaveAttribute('data-safe-area', 'true');
    expect(navigation).toHaveAttribute('data-overflow-safe', 'true');
    expect(navigation).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('provides reduced-motion CSS support', () => {
    renderNavigation();
    const navigation = screen.getByRole('navigation', { name: 'Clubnavigation' });
    expect(navigation).toHaveClass('club-navigation-motion');
    expect(navigation).toHaveAttribute('data-reduced-motion-safe', 'true');
  });

  it('keeps navigation controls touch-sized and keyboard-focusable', () => {
    renderNavigation();

    [...screen.getAllByRole('link'), ...screen.getAllByRole('button')].forEach((control) => {
      expect(control).toHaveClass('touch-control', 'focus-visible:outline-2');
    });
  });

  it('documents overflow-safe layout assumptions for narrow screens', () => {
    render(
      <MemoryRouter>
        <ClubNavigation variant="mobile" onRundmail={vi.fn()} />
      </MemoryRouter>,
    );
    const navigation = screen.getByRole('navigation', { name: 'Clubnavigation' });
    expect(navigation).toHaveAttribute('data-overflow-safe', 'true');
    expect(navigation.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });
});
