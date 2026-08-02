import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useEvents: vi.fn(),
  useEvent: vi.fn(),
  modal: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useEvents', () => ({ useEvents: mocks.useEvents, useEvent: mocks.useEvent }));
vi.mock('../components/EventSignupModal', () => ({
  default: (props: { eventId: number; onClose: () => void }) => {
    mocks.modal(props);
    return <div role="dialog">Signup modal for {props.eventId}<button onClick={props.onClose}>close</button></div>;
  },
}));

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
  status: 'published',
  signup_people_count: 3,
  ...overrides,
});

describe('Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1', role: 'member' } });
    mocks.useEvents.mockReturnValue({ data: [event(), event({ id: 2, title: 'Vergangen', event_date: '2000-01-01' }), event({ id: 3, title: 'Entwurf', status: 'draft' })], isLoading: false, error: null });
    mocks.useEvent.mockReturnValue({ data: { event: event(), own_signup: { people_count: 2 } }, isLoading: false, error: null });
  });

  it('renders only future published events and required metadata', () => {
    render(<Events />);

    expect(screen.getByText('Sommerfest')).toBeInTheDocument();
    expect(screen.getByText(/Clubheim/)).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 20 Personen/)).toBeInTheDocument();
    expect(screen.getByText(/Anmeldung bis/)).toBeInTheDocument();
    expect(screen.queryByText('Vergangen')).not.toBeInTheDocument();
    expect(screen.queryByText('Entwurf')).not.toBeInTheDocument();
  });

  it('shows only the current member signup status and opens the modal', async () => {
    const user = userEvent.setup();
    render(<Events />);

    expect(screen.getByText(/Ihre Anmeldung: 2 Personen/)).toBeInTheDocument();
    expect(screen.queryByText(/member-2|Andere Mitglieder|fremde Anmeldung/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Anmeldung bearbeiten/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Signup modal for 1');
  });

  it('keeps full events visible but does not offer an action', () => {
    mocks.useEvents.mockReturnValue({ data: [event({ capacity: 3, signup_people_count: 3 })], isLoading: false, error: null });
    render(<Events />);

    expect(screen.getByText(/Ausgebucht/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anmelden/i })).not.toBeInTheDocument();
  });
});
