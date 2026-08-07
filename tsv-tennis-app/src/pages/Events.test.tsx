import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useEvents: vi.fn(),
  modal: vi.fn(),
  formModal: vi.fn(),
  signupsModal: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useEvents', () => ({ useEvents: mocks.useEvents }));
vi.mock('../components/EventSignupModal', () => ({
  default: (props: { eventId: number; onClose: () => void }) => {
    mocks.modal(props);
    return <div role="dialog">Signup modal for {props.eventId}<button onClick={props.onClose}>close</button></div>;
  },
}));
vi.mock('../components/EventFormModal', () => ({ default: () => <div>Event form</div> }));
vi.mock('../components/EventSignupsModal', () => ({ default: () => <div>Event signups</div> }));

import Events from './Events';

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  type: 'event',
  title: 'Sommerfest',
  description: 'Gemeinsamer Abend',
  event_date: '2099-07-12',
  start_time: '18:00',
  end_time: '22:00',
  location: 'Clubheim',
  signup_deadline: '2099-07-01',
  capacity: 20,
  allow_salad: false,
  allow_cake: false,
  allow_signups: true,
  status: 'published',
  signup_people_count: 3,
  ...overrides,
});

const detail = (eventOverrides: Record<string, unknown> = {}, ownSignup: Record<string, unknown> | null = null) => ({
  event: event(eventOverrides),
  own_signup: ownSignup,
});

const renderEvents = (details: Array<{ event: Record<string, unknown>; own_signup: Record<string, unknown> | null }> | null = null) => {
  if (details) {
    mocks.useEvents.mockReturnValue({ data: details, isLoading: false, error: null });
  }
  return render(<MemoryRouter><Events /></MemoryRouter>);
};

describe('Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1', role: 'member' } });
    mocks.useEvents.mockReturnValue({ data: [detail({}, { people_count: 2 }), detail({ id: 2, title: 'Vergangen', event_date: '2000-01-01' }), detail({ id: 3, title: 'Entwurf', status: 'draft' })], isLoading: false, error: null });
  });

  it('renders only future published events and required metadata', () => {
    renderEvents();

    expect(screen.getByText('Sommerfest')).toBeInTheDocument();
    expect(screen.getByText(/Clubheim/)).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 20 Personen/)).toBeInTheDocument();
    expect(screen.getByText(/Anmeldung bis/)).toBeInTheDocument();
    expect(screen.queryByText('Vergangen')).not.toBeInTheDocument();
    expect(screen.queryByText('Entwurf')).not.toBeInTheDocument();
  });

  it('hides the Plätze row when the event has no capacity limit', () => {
    renderEvents([detail({ capacity: null, signup_people_count: 0 })]);

    expect(screen.queryByText(/Plätze:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Personen/)).not.toBeInTheDocument();
  });

  it('uses the shared card shell for event cards', () => {
    renderEvents();

    expect(screen.getByRole('article', { name: '' })).toHaveClass('card-shell');
    expect(screen.getByRole('article', { name: '' }).querySelector('dl')).toBeInTheDocument();
  });

  it('shows no signup button for an event with signups disabled', () => {
    renderEvents([detail({ allow_signups: false })]);
    expect(screen.queryByRole('button', { name: /anmelden|ausgebucht|anmeldeschluss/i })).not.toBeInTheDocument();
  });

  it('shows the own signup and a cancel button for a disabled event the member signed up for', async () => {
    const user = userEvent.setup();
    renderEvents([detail({ allow_signups: false }, { people_count: 2 })]);

    expect(screen.getByText(/Ihre Anmeldung: 2 Personen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Stornieren/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Signup modal for 1');
  });

  it('hides signup UI for a disabled event the member did not sign up for', () => {
    renderEvents([detail({ allow_signups: false }, null)]);

    expect(screen.queryByText(/Ihre Anmeldung/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stornieren/i })).not.toBeInTheDocument();
  });

  it('shows only the current member signup status and opens the modal', async () => {
    const user = userEvent.setup();
    renderEvents();

    expect(screen.getByText(/Ihre Anmeldung: 2 Personen/)).toBeInTheDocument();
    expect(screen.queryByText(/member-2|Andere Mitglieder|fremde Anmeldung/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Anmeldung bearbeiten/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Signup modal for 1');
  });

  it('shows the own signup status on the card before it is opened', () => {
    renderEvents();

    expect(screen.getByText(/Ihre Anmeldung: 2 Personen/)).toBeInTheDocument();
  });

  it('opens the event identified by the eventId query parameter', () => {
    render(<MemoryRouter initialEntries={['/dashboard/veranstaltungen?eventId=1']}><Events /></MemoryRouter>);

    expect(screen.getByRole('dialog')).toHaveTextContent('Signup modal for 1');
  });

  it('clears the eventId query parameter when the signup modal closes', async () => {
    const user = userEvent.setup();
    const LocationProbe = () => <span data-testid="router-search">{useLocation().search}</span>;
    render(
      <MemoryRouter initialEntries={['/dashboard/veranstaltungen?eventId=1']}>
        <Events />
        <LocationProbe />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('router-search')).toHaveTextContent('');
  });

  it('keeps full events visible but does not offer an action', () => {
    mocks.useEvents.mockReturnValue({ data: [detail({ capacity: 3, signup_people_count: 3 }, null)], isLoading: false, error: null });
    renderEvents();

    expect(screen.getByText(/Ausgebucht/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anmelden/i })).not.toBeInTheDocument();
  });

  it('displays RFC3339 deadlines and keeps a date-only deadline actionable', () => {
    mocks.useEvents.mockReturnValue({ data: [detail({ signup_deadline: '2099-07-01T23:00:00Z' }), detail({ id: 5, title: 'Tagesschluss', signup_deadline: '2099-07-12' })], isLoading: false, error: null });
    renderEvents();

    expect(screen.getAllByText(/Anmeldung bis/)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Anmelden/i })).toHaveLength(2);
  });

  it('keeps edit and cancel available for an own signup on a full event', async () => {
    const user = userEvent.setup();
    mocks.useEvents.mockReturnValue({ data: [detail({ capacity: 3, signup_people_count: 3 }, { people_count: 1 })], isLoading: false, error: null });
    renderEvents();

    await user.click(screen.getByRole('button', { name: /Anmeldung bearbeiten/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Signup modal for 1');
  });

  it('does not show management controls to regular members', () => {
    renderEvents();
    expect(screen.queryByRole('button', { name: /Veranstaltung erstellen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anmeldungen/i })).not.toBeInTheDocument();
  });

  it('shows management controls to Orga', () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', role: 'orga' } });
    renderEvents();
    expect(screen.getByRole('button', { name: /Veranstaltung erstellen/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Anmeldungen/i })).not.toHaveLength(0);
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Bearbeiten$/i })).toHaveLength(3);
  });

  it('uses shared button variants for event actions', () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', role: 'orga' } });
    renderEvents();

    expect(screen.getByRole('button', { name: /Veranstaltung erstellen/i })).toHaveClass('bg-[var(--primary)]');
    expect(screen.getAllByRole('button', { name: /^Bearbeiten$/i })[0]).toHaveClass('border-[var(--hairline-strong)]');
  });

  it('lets Orga members sign up while retaining management controls', async () => {
    const user = userEvent.setup();
    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', role: 'orga' } });
    mocks.useEvents.mockReturnValue({ data: [detail({}, null)], isLoading: false, error: null });
    renderEvents();

    expect(screen.getByRole('button', { name: /Bearbeiten/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anmeldungen/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Anmelden$/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Signup modal for 1');
  });

  it('marks events as active and keeps the work-hours tab available', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/veranstaltungen']}>
        <Events />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: /veranstaltungen/i })[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: /arbeitsstunden/i })[0]).toHaveAttribute('href', '/dashboard/arbeitsstunden');
  });

  it('uses the shell title as the single page heading', () => {
    renderEvents();

    expect(screen.getAllByRole('heading', { name: 'Veranstaltungen' })).toHaveLength(1);
  });

  it('uses a single topbar navigation without legacy page switches', () => {
    renderEvents();

    expect(screen.getAllByRole('navigation', { name: 'Clubnavigation' })).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: 'Dashboard-Bereiche' })).not.toBeInTheDocument();
  });
});
