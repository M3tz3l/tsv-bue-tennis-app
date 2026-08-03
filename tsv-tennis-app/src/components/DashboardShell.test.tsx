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
    return props.isOpen ? <div role="dialog">Mail Composer</div> : null;
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
        <DashboardShell title="Arbeitsstunden" onOpenMailComposer={vi.fn()}>
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
    expect(screen.getByText('Willkommen, member@example.com')).toBeInTheDocument();
  });

  it('opens MailComposer only through the Orga navigation action and reserves mobile bottom space', async () => {
    const onOpenMailComposer = vi.fn();
    const { getAllByRole } = render(
      <MemoryRouter>
        <DashboardShell title="Veranstaltungen" onOpenMailComposer={onOpenMailComposer}>
          <p>Events</p>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('dashboard-shell-content')).toHaveClass('pb-[var(--club-nav-height)]');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    getAllByRole('button', { name: 'Rundmail' })[0].click();
    expect(onOpenMailComposer).toHaveBeenCalledOnce();
  });
});
