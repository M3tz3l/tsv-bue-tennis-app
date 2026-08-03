import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));

import TopbarMobileMenu from './TopbarMobileMenu';

const renderMenu = (onOpenMailComposer = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={['/dashboard/veranstaltungen']}>
      <TopbarMobileMenu isOpen onClose={vi.fn()} onOpenMailComposer={onOpenMailComposer} />
    </MemoryRouter>,
  );

describe('TopbarMobileMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { id: 'member-1', name: 'Mitglied', email: 'member@example.com', role: 'member' },
      logout: vi.fn(),
    });
  });

  it('renders a dialog with routes and a close control', () => {
    renderMenu();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Veranstaltungen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <TopbarMobileMenu isOpen onClose={onClose} onOpenMailComposer={vi.fn()} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows Rundmail only for orga users and triggers the mail composer', async () => {
    const user = userEvent.setup();
    const onOpenMailComposer = vi.fn();
    mocks.useAuth.mockReturnValue({
      user: { id: 'orga-1', name: 'Orga', role: 'orga' },
      logout: vi.fn(),
    });
    renderMenu(onOpenMailComposer);

    await user.click(screen.getByRole('button', { name: 'Rundmail' }));
    expect(onOpenMailComposer).toHaveBeenCalledOnce();
  });

  it('hides Rundmail from non-orga users', () => {
    renderMenu();
    expect(screen.queryByRole('button', { name: 'Rundmail' })).not.toBeInTheDocument();
  });

  it('keeps all controls touch-sized and focus-visible', () => {
    renderMenu();
    [...screen.getAllByRole('link'), ...screen.getAllByRole('button')].forEach((control) => {
      expect(control).toHaveClass('touch-control', 'focus-visible:outline-2');
    });
  });
});
