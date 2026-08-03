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

  it('renders a single top navigation, identity, title, and content', () => {
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

    expect(screen.getByRole('navigation', { name: 'Clubnavigation' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Clubnavigation' })).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'TSV BÜ Tennis Logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Arbeitsstunden' })).toBeInTheDocument();
    expect(screen.getByText('Arbeitsstunden-Inhalt')).toBeInTheDocument();
  });

  it('offsets the page content below the fixed topbar', () => {
    render(
      <MemoryRouter>
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

    expect(screen.getByTestId('dashboard-shell-content')).toHaveClass('pt-16');
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
