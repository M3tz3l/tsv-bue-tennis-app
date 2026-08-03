import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventSummary } from '../types';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useEvent: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useEvents', () => ({ useEvent: mocks.useEvent }));

import UpcomingEventsList from './UpcomingEventsList';

const event = (overrides: Partial<EventSummary> = {}): EventSummary => ({
  id: 1,
  type: 'event',
  title: 'Sommerfest',
  description: null,
  event_date: '2099-08-20',
  start_time: '18:00',
  end_time: null,
  location: 'Clubhaus',
  signup_deadline: null,
  capacity: null,
  allow_salad: false,
  allow_cake: false,
  status: 'published',
  signup_people_count: 0,
  ...overrides,
});

describe('UpcomingEventsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1' } });
    mocks.useEvent.mockReturnValue({ data: { own_signup: null } });
  });

  it('uses the shared card shell and stack rhythm for upcoming events', () => {
    const { container } = render(<MemoryRouter><UpcomingEventsList events={[event()]} /></MemoryRouter>);

    expect(container.querySelector('section')).toHaveClass('card-shell');
    expect(container.querySelector('.stack-md')).toBeInTheDocument();
  });

  it('filters published future events, sorts them, and limits the rows', () => {
    render(
      <MemoryRouter>
        <UpcomingEventsList events={[
          event({ id: 1, title: 'Später', event_date: '2099-09-01' }),
          event({ id: 2, title: 'Früher', event_date: '2099-08-10' }),
          event({ id: 3, title: 'Entwurf', status: 'draft' }),
          event({ id: 4, title: 'Vergangen', event_date: '2000-01-01' }),
          event({ id: 5, title: 'Dritter', event_date: '2099-08-20', start_time: '08:00' }),
          event({ id: 6, title: 'Vierter', event_date: '2099-08-20', start_time: '09:00' }),
        ]} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Früher')).toBeInTheDocument();
    expect(screen.getByText('Dritter')).toBeInTheDocument();
    expect(screen.queryByText('Später')).not.toBeInTheDocument();
    expect(screen.queryByText('Entwurf')).not.toBeInTheDocument();
    expect(screen.queryByText('Vergangen')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Früher/ })).toHaveAttribute('href', '/dashboard/veranstaltungen?eventId=2');
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('10. August 2099');
  });

  it('orders same-day events by start time', () => {
    render(<MemoryRouter><UpcomingEventsList limit={2} events={[
      event({ id: 9, title: 'Später Termin', event_date: '2099-08-20', start_time: '09:00' }),
      event({ id: 8, title: 'Früher Termin', event_date: '2099-08-20', start_time: '08:00' }),
    ]} /></MemoryRouter>);

    const rows = screen.getAllByRole('article');
    expect(rows[0]).toHaveTextContent('08:00 Uhr');
    expect(rows[1]).toHaveTextContent('09:00 Uhr');
  });

  it('shows only the current member\'s signup state', () => {
    mocks.useEvent.mockImplementation((_userId: string | undefined, eventId: number | undefined) => ({
      data: eventId === 1 ? { own_signup: { people_count: 2 } } : { own_signup: null },
    }));

    render(<MemoryRouter><UpcomingEventsList events={[event(), event({ id: 2, title: 'Training' })]} /></MemoryRouter>);

    expect(screen.getByText('Ihre Anmeldung: 2 Personen')).toBeInTheDocument();
    expect(mocks.useEvent).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/andere Anmeldungen/i)).not.toBeInTheDocument();
  });

  it('uses one detail query per displayed event for own signup status', () => {
    const events = [event({ id: 1 }), event({ id: 2 }), event({ id: 3 }), event({ id: 4 })];
    render(<MemoryRouter><UpcomingEventsList events={events} /></MemoryRouter>);

    expect(mocks.useEvent).toHaveBeenCalledTimes(3);
    expect(mocks.useEvent).toHaveBeenNthCalledWith(1, 'member-1', expect.any(Number));
  });

  it('makes event actions touch-sized and visibly focusable', () => {
    render(<MemoryRouter><UpcomingEventsList events={[event()]} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Sommerfest' })).toHaveClass('min-h-11', 'focus-visible:outline-2', 'focus-visible:ring-2');
  });

  it('renders empty, loading, and error states with correct visual elements', () => {
    const { rerender } = render(<MemoryRouter><UpcomingEventsList events={[]} /></MemoryRouter>);
    expect(screen.getByText(/keine anstehenden Veranstaltungen veröffentlicht/i)).toBeInTheDocument();
    
    // CalendarIcon for empty state
    const emptyIcon = screen.getByTestId('empty-events-icon');
    expect(emptyIcon).toBeInTheDocument();
    expect(emptyIcon).toHaveClass('text-[var(--hairline)]', 'h-12', 'w-12');
    
    expect(screen.getAllByRole('link', { name: /Veranstaltungen/i }).some((link) => link.getAttribute('href') === '/dashboard/veranstaltungen')).toBe(true);

    rerender(<MemoryRouter><UpcomingEventsList events={undefined} isLoading /></MemoryRouter>);
    // Skeleton UI
    const skeletons = screen.getAllByTestId('event-skeleton');
    expect(skeletons).toHaveLength(3);
    expect(skeletons[0]).toHaveClass('bg-[var(--hairline-soft)]', 'animate-pulse', 'h-16', 'w-full', 'rounded-md');
    expect(screen.queryByText(/Veranstaltungen werden geladen/i)).not.toBeInTheDocument();

    rerender(<MemoryRouter><UpcomingEventsList events={undefined} error={new Error('failed')} /></MemoryRouter>);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});
