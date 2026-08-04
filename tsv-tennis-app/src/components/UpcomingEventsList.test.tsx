import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDetail, EventSummary } from '../types';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));

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
  allow_signups: true,
  status: 'published',
  signup_people_count: 0,
  ...overrides,
});

const detail = (eventOverrides: Partial<EventSummary> = {}, ownSignup: Record<string, unknown> | null = null): EventDetail => ({
  event: event(eventOverrides),
  own_signup: ownSignup as EventDetail['own_signup'],
});

describe('UpcomingEventsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1' } });
  });

  it('uses the shared card shell and stack rhythm for upcoming events', () => {
    const { container } = render(<MemoryRouter><UpcomingEventsList events={[detail()]} /></MemoryRouter>);

    expect(container.querySelector('section')).toHaveClass('card-shell');
    expect(container.querySelector('.stack-md')).toBeInTheDocument();
  });

  it('filters published future events, sorts them, and limits the rows', () => {
    render(
      <MemoryRouter>
        <UpcomingEventsList events={[
          detail({ id: 1, title: 'Später', event_date: '2099-09-01' }),
          detail({ id: 2, title: 'Früher', event_date: '2099-08-10' }),
          detail({ id: 3, title: 'Entwurf', status: 'draft' }),
          detail({ id: 4, title: 'Vergangen', event_date: '2000-01-01' }),
          detail({ id: 5, title: 'Dritter', event_date: '2099-08-20', start_time: '08:00' }),
          detail({ id: 6, title: 'Vierter', event_date: '2099-08-20', start_time: '09:00' }),
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
      detail({ id: 9, title: 'Später Termin', event_date: '2099-08-20', start_time: '09:00' }),
      detail({ id: 8, title: 'Früher Termin', event_date: '2099-08-20', start_time: '08:00' }),
    ]} /></MemoryRouter>);

    const rows = screen.getAllByRole('article');
    expect(rows[0]).toHaveTextContent('08:00 Uhr');
    expect(rows[1]).toHaveTextContent('09:00 Uhr');
  });

  it('shows only the current member\'s signup state', () => {
    render(<MemoryRouter><UpcomingEventsList events={[
      detail({}, { people_count: 2 }),
      detail({ id: 2, title: 'Training' }, null),
    ]} /></MemoryRouter>);

    expect(screen.getByText('Ihre Anmeldung: 2 Personen')).toBeInTheDocument();
    expect(screen.queryByText(/andere Anmeldungen/i)).not.toBeInTheDocument();
  });

  it('makes event actions touch-sized and visibly focusable', () => {
    render(<MemoryRouter><UpcomingEventsList events={[detail()]} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Sommerfest' })).toHaveClass('min-h-11', 'focus-visible:outline-2', 'focus-visible:ring-2');
  });

  it('renders an informational event title as plain text', () => {
    render(<MemoryRouter><UpcomingEventsList events={[detail({ title: 'Training', allow_signups: false })]} /></MemoryRouter>);
    const link = screen.queryByRole('link', { name: /training/i });
    expect(link).not.toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();
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
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
