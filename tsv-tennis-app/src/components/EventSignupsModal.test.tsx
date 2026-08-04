import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), useEventSignups: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useEvents', () => ({ useEventSignups: mocks.useEventSignups }));

import EventSignupsModal from './EventSignupsModal';

describe('EventSignupsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', role: 'orga' } });
    mocks.useEventSignups.mockReturnValue({ data: {
      signups: [
        { id: 1, event_id: 4, member_id: 'member-a', member_name: 'Anna A', people_count: 2, salad_count: 1, cake_count: 0, comment: 'Kommt spaeter' },
        { id: 2, event_id: 4, member_id: 'member-b', member_name: 'Berta B', people_count: 3, salad_count: 0, cake_count: 2, comment: null },
      ], total_people: 5, total_salad: 1, total_cake: 2,
    }, isLoading: false, error: null });
  });

  it('shows signup details and aggregate totals to Orga', () => {
    render(<EventSignupsModal eventId={4} isOpen onClose={vi.fn()} />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Anna A')).toBeInTheDocument();
    expect(within(table).getByText('Berta B')).toBeInTheDocument();
    expect(within(table).getByText('Kommt spaeter')).toBeInTheDocument();

    const totals = table.querySelector('tfoot');
    expect(totals).not.toBeNull();
    expect(within(totals as HTMLElement).getByText('Gesamt')).toBeInTheDocument();
    expect(within(totals as HTMLElement).getByText('5')).toBeInTheDocument();
    expect(within(totals as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(totals as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('shows an empty state and zero totals when no one has signed up', () => {
    mocks.useEventSignups.mockReturnValue({ data: {
      signups: [], total_people: 0, total_salad: 0, total_cake: 0,
    }, isLoading: false, error: null });
    render(<EventSignupsModal eventId={4} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Noch keine Anmeldungen')).toBeInTheDocument();
  });

  it('does not render signup details for regular members', () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1', role: 'member' } });
    render(<EventSignupsModal eventId={4} isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.useEventSignups).toHaveBeenCalledWith('member-1', 4, false);
  });

  it('uses shared minimum touch and action control classes and accessibility styles', () => {
    render(<EventSignupsModal eventId={4} isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveClass('touch-control');

    // Backdrop blur
    const backdrop = screen.getByTestId('modal-backdrop');
    expect(backdrop).toHaveClass('backdrop-blur-sm');
  });
});
