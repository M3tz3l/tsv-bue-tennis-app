import { render, screen } from '@testing-library/react';
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
        { id: 1, event_id: 4, member_id: 'member-a', people_count: 2, salad_count: 1, cake_count: 0, comment: 'Kommt spaeter' },
        { id: 2, event_id: 4, member_id: 'member-b', people_count: 3, salad_count: 0, cake_count: 2, comment: null },
      ], total_people: 5, total_salad: 1, total_cake: 2,
    }, isLoading: false, error: null });
  });

  it('shows signup details and aggregate totals to Orga', () => {
    render(<EventSignupsModal eventId={4} isOpen onClose={vi.fn()} />);
    expect(screen.getByText('member-a')).toBeInTheDocument();
    expect(screen.getByText('Kommt spaeter')).toBeInTheDocument();
    expect(screen.getByText(/Personen gesamt: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Salate gesamt: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Kuchen gesamt: 2/)).toBeInTheDocument();
  });

  it('does not render signup details for regular members', () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1', role: 'member' } });
    render(<EventSignupsModal eventId={4} isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
