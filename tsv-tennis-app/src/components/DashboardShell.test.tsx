import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  mailComposer: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('./MailComposer', () => ({
  default: (props: { isOpen: boolean; onClose: () => void }) => {
    mocks.mailComposer(props);
    return props.isOpen ? <div role="dialog"><button onClick={props.onClose}>close mail composer</button></div> : null;
  },
}));

import DashboardShell from './DashboardShell';

describe('DashboardShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { name: 'Orga', email: 'member@example.com', role: 'orga' },
      logout: vi.fn(),
    });
  });

  it('renders identity, title, shared navigation, account action, and content', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/arbeitsstunden']}>
        <DashboardShell
          title="Arbeitsstunden"
          onOpenMailComposer={vi.fn()}
          isMailComposerOpen={false}
          onCloseMailComposer={vi.fn()}
        >
          <p>Arbeitsstunden-Inhalt</p>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'TSV BÜ Tennis Logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Arbeitsstunden' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Arbeitsstunden' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Veranstaltungen' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Rundmail' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Abmelden' })).toHaveLength(2);
    expect(screen.getByText('Arbeitsstunden-Inhalt')).toBeInTheDocument();
    expect(screen.getByText('Willkommen, Orga')).toBeInTheDocument();
  });

  it('calls the page callback from either navigation and preserves responsive visibility', () => {
    const onOpenMailComposer = vi.fn();
    render(
      <MemoryRouter>
        <DashboardShell
          title="Veranstaltungen"
          onOpenMailComposer={onOpenMailComposer}
          isMailComposerOpen={false}
          onCloseMailComposer={vi.fn()}
        >
          <p>Events</p>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('dashboard-shell-content')).toHaveClass('pb-[var(--club-nav-height)]', 'min-w-0');
    expect(screen.getByTestId('dashboard-shell-content')).toHaveAttribute('data-mobile-safe-spacing', 'true');
    const navigations = screen.getAllByRole('navigation', { name: 'Clubnavigation' });
    expect(navigations[0]).toHaveClass('hidden', 'lg:flex');
    expect(navigations[1]).toHaveClass('lg:hidden');
    screen.getAllByRole('button', { name: 'Rundmail' }).forEach((button) => button.click());
    expect(onOpenMailComposer).toHaveBeenCalledTimes(2);
  });

  it('provides only the shared navigation without legacy dashboard switches', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/veranstaltungen']}>
        <DashboardShell
          title="Veranstaltungen"
          onOpenMailComposer={vi.fn()}
          isMailComposerOpen={false}
          onCloseMailComposer={vi.fn()}
        >
          <p>Events</p>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('navigation', { name: 'Clubnavigation' })).toHaveLength(2);
    expect(screen.queryByRole('navigation', { name: 'Dashboard-Bereiche' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Veranstaltungen' })).toHaveLength(2);
  });

  it('passes controlled MailComposer state through and exposes its close callback', () => {
    const onCloseMailComposer = vi.fn();
    render(
      <MemoryRouter>
        <DashboardShell
          title="Veranstaltungen"
          onOpenMailComposer={vi.fn()}
          isMailComposerOpen
          onCloseMailComposer={onCloseMailComposer}
        >
          <p>Events</p>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(mocks.mailComposer).toHaveBeenCalledWith(expect.objectContaining({ isOpen: true, onClose: onCloseMailComposer }));
    screen.getByRole('button', { name: 'close mail composer' }).click();
    expect(onCloseMailComposer).toHaveBeenCalledOnce();
  });
});
