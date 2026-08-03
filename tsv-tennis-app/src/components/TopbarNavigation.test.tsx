import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));

import TopbarNavigation from './TopbarNavigation';

const renderTopbar = (initialEntry = '/dashboard/arbeitsstunden', onOpenMailComposer = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TopbarNavigation onOpenMailComposer={onOpenMailComposer} />
    </MemoryRouter>,
  );

describe('TopbarNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { id: 'member-1', name: 'Mitglied', email: 'member@example.com', role: 'member' },
      logout: vi.fn(),
    });
  });

  it('renders a fixed top navigation landmark with the dashboard routes', () => {
    renderTopbar();

    const nav = screen.getByRole('navigation', { name: 'Clubnavigation' });
    expect(nav).toHaveClass('fixed', 'inset-x-0', 'top-0');
    expect(screen.getByRole('link', { name: 'Übersicht' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Arbeitsstunden' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Veranstaltungen' })).toHaveAttribute('href', '/dashboard/veranstaltungen');
  });

  it('provides a mobile menu trigger that is hidden on large screens', () => {
    renderTopbar();
    const trigger = screen.getByRole('button', { name: 'Menü öffnen' });
    expect(trigger).toHaveClass('lg:hidden', 'touch-control', 'focus-visible:outline-2');
  });

  it('shows Rundmail only for orga users and triggers the mail composer', async () => {
    const user = userEvent.setup();
    const onOpenMailComposer = vi.fn();
    mocks.useAuth.mockReturnValue({
      user: { id: 'orga-1', name: 'Orga', email: 'orga@example.com', role: 'orga' },
      logout: vi.fn(),
    });
    renderTopbar('/dashboard/arbeitsstunden', onOpenMailComposer);

    await user.click(screen.getByRole('button', { name: 'Orga' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rundmail' }));
    expect(onOpenMailComposer).toHaveBeenCalledOnce();
  });

  it('hides Rundmail from non-orga users', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: 'Mitglied' }));
    expect(screen.queryByRole('menuitem', { name: 'Rundmail' })).not.toBeInTheDocument();
  });

  it('opens and closes the mobile drawer from the trigger and closes it via a route link', async () => {
    const user = userEvent.setup();
    mocks.useAuth.mockReturnValue({
      user: { id: 'orga-1', name: 'Orga', email: 'orga@example.com', role: 'orga' },
      logout: vi.fn(),
    });
    renderTopbar();

    const trigger = screen.getByRole('button', { name: 'Menü öffnen' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('link', { name: 'Übersicht' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the mobile drawer and opens the mail composer when Rundmail is clicked', async () => {
    const user = userEvent.setup();
    const onOpenMailComposer = vi.fn();
    mocks.useAuth.mockReturnValue({
      user: { id: 'orga-1', name: 'Orga', email: 'orga@example.com', role: 'orga' },
      logout: vi.fn(),
    });
    renderTopbar('/dashboard/arbeitsstunden', onOpenMailComposer);

    const trigger = screen.getByRole('button', { name: 'Menü öffnen' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Rundmail' }));
    expect(onOpenMailComposer).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
