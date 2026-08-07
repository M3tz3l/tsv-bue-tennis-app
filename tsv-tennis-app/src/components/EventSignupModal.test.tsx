import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useEvent: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  pending: false,
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useEvents', () => ({
  useEvent: mocks.useEvent,
  useCreateEventSignup: () => ({ mutateAsync: mocks.create, isPending: mocks.pending }),
  useUpdateEventSignup: () => ({ mutateAsync: mocks.update, isPending: mocks.pending }),
  useDeleteEventSignup: () => ({ mutateAsync: mocks.remove, isPending: mocks.pending }),
}));
vi.mock('react-toastify', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import EventSignupModal from './EventSignupModal';

const detail = (overrides: Record<string, unknown> = {}) => ({
  event: {
    id: 1, type: 'event', title: 'Sommerfest', description: null,
    event_date: '2099-07-12', start_time: null, end_time: null, location: null,
    signup_deadline: null, capacity: 20, allow_salad: true, allow_cake: true,
    allow_signups: true,
    status: 'published', signup_people_count: 2,
  },
  own_signup: null,
  ...overrides,
});

describe('EventSignupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending = false;
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1' } });
    mocks.useEvent.mockReturnValue({ data: detail(), isLoading: false, error: null });
    mocks.create.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    mocks.remove.mockResolvedValue({});
  });

  it('renders nothing when signups are disabled and the member has no signup', () => {
    mocks.useEvent.mockReturnValue({ data: detail({ event: { ...detail().event, allow_signups: false } }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a read-only cancel state when signups are disabled but the member signed up', async () => {
    const user = userEvent.setup();
    mocks.useEvent.mockReturnValue({ data: detail({ event: { ...detail().event, allow_signups: false }, own_signup: { id: 7, event_id: 1, member_id: 'member-1', people_count: 2, salad_count: 1, cake_count: 0, comment: 'Hi' } }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);

    expect(screen.getByText(/Ihre Anmeldung: 2 Personen/)).toBeInTheDocument();
    expect(screen.getByText(/Salate: 1/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Personen/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Salat/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Kuchen/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anmelden|Aktualisieren|Speichern/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Abmelden/i }));
    expect(mocks.remove).toHaveBeenCalledWith(1);
  });

  it('defaults people to one and renders enabled contribution fields only', () => {
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Personen/i)).toHaveValue(1);
    expect(screen.getByLabelText(/Salat/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Kuchen/i)).toBeInTheDocument();
  });

  it('hides disabled contribution fields and rejects fewer than one person with an inline error', async () => {
    const user = userEvent.setup();
    mocks.useEvent.mockReturnValue({ data: detail({ event: { ...detail().event, allow_salad: false, allow_cake: false } }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
    expect(screen.queryByLabelText(/Salat/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Kuchen/i)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Personen/i));
    await user.type(screen.getByLabelText(/Personen/i), '0');
    await user.click(screen.getByRole('button', { name: /Anmelden/i }));
    
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringMatching(/mindestens 1/i));
    
    const errorText = screen.getByText(/Die Anzahl der Personen muss mindestens 1 sein/i);
    expect(errorText).toBeInTheDocument();
    expect(errorText).toHaveClass('text-[var(--error)]');
    expect(screen.getByLabelText(/Personen/i)).toHaveClass('border-[var(--error)]');
  });

  it('rejects negative contribution quantities with an inline error', async () => {
    const user = userEvent.setup();
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
    await user.clear(screen.getByLabelText(/Salat/i));
    await user.type(screen.getByLabelText(/Salat/i), '-1');
    await user.click(screen.getByRole('button', { name: /Anmelden/i }));

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringMatching(/nicht negativ/i));

    const errorText = screen.getByText(/Beiträge dürfen nicht negativ sein/i);
    expect(errorText).toBeInTheDocument();
    expect(errorText).toHaveClass('text-[var(--error)]');
    expect(screen.getByLabelText(/Salat/i)).toHaveClass('border-[var(--error)]');
  });

  it('creates a signup with the form values', async () => {
    const user = userEvent.setup();
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
    await user.clear(screen.getByLabelText(/Personen/i));
    await user.type(screen.getByLabelText(/Personen/i), '3');
    await user.clear(screen.getByLabelText(/Salat/i));
    await user.type(screen.getByLabelText(/Salat/i), '2');
    await user.click(screen.getByRole('button', { name: /Anmelden/i }));
    expect(mocks.create).toHaveBeenCalledWith({ id: 1, payload: { people_count: 3, salad_count: 2, cake_count: 0, comment: null } });
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('updates and cancels an existing signup', async () => {
    const user = userEvent.setup();
    mocks.useEvent.mockReturnValue({ data: detail({ own_signup: { id: 7, event_id: 1, member_id: 'member-1', people_count: 2, salad_count: 1, cake_count: 0, comment: 'Hi' } }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Personen/i)).toHaveValue(2);
    await user.click(screen.getByRole('button', { name: /Aktualisieren/i }));
    expect(mocks.update).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Abmelden/i }));
    expect(mocks.remove).toHaveBeenCalledWith(1);
  });

  it('keeps all close controls disabled while a mutation is pending', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    mocks.pending = true;
    render(<EventSignupModal eventId={1} isOpen onClose={onClose} />);

    expect(screen.getByRole('button', { name: /Abbrechen/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Schließen/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Abbrechen/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['loading', { data: undefined, isLoading: true, error: null }],
    ['error', { data: undefined, isLoading: false, error: new Error('Laden fehlgeschlagen') }],
  ])('does not expose an enabled submit button without a form while %s', (_state, queryState) => {
    mocks.useEvent.mockReturnValue(queryState);
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);

    const submit = screen.queryByRole('button', { name: /Anmelden|Speichern|Aktualisieren/i });
    expect(submit).not.toBeInTheDocument();
    expect(document.getElementById('event-signup-form')).not.toBeInTheDocument();
  });

  it('uses shared minimum touch and action control classes and accessibility styles', () => {
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveClass('touch-control');
    expect(screen.getByRole('button', { name: /Abbrechen/i })).toHaveClass('action-control');
    
    const submitBtn = screen.getByRole('button', { name: /Anmelden/i });
    expect(submitBtn).toHaveClass('action-control');
    expect(submitBtn).toHaveClass('bg-[var(--primary)]');
    expect(submitBtn).toHaveClass('hover:bg-[var(--primary-active)]');

    const cancelBtn = screen.getByRole('button', { name: /Abbrechen/i });
    expect(cancelBtn).toHaveClass('border-[var(--hairline-strong)]');

    // Inputs have touch targets
    const personInput = screen.getByLabelText(/Personen/i);
    expect(personInput).toHaveClass('min-h-[44px]');
    
    // Backdrop blur
    const backdrop = screen.getByTestId('modal-backdrop');
    expect(backdrop).toHaveClass('backdrop-blur-sm');
  });

  it('uses the destructive token for cancelling an existing signup', () => {
    mocks.useEvent.mockReturnValue({ data: detail({ own_signup: { id: 7, event_id: 1, member_id: 'member-1', people_count: 2, salad_count: 1, cake_count: 0, comment: 'Hi' } }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Abmelden/i })).toHaveClass('action-control');
  });

  it('shows API errors through a toast and keeps the modal open', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error('Serverfehler'));
    render(<EventSignupModal eventId={1} isOpen onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /Anmelden/i }));

    expect(mocks.toastError).toHaveBeenCalledWith('Serverfehler');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the event details so a link recipient can see what the event is about', () => {
    mocks.useEvent.mockReturnValue({ data: detail({
      event: {
        ...detail().event,
        description: 'Gemeinsamer Abend mit Gesang',
        start_time: '18:00', end_time: '22:00',
        location: 'Clubheim', signup_deadline: '2099-07-01',
      },
    }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Gemeinsamer Abend mit Gesang')).toBeInTheDocument();
    expect(screen.getByText(/12\. Juli 2099/)).toBeInTheDocument();
    expect(screen.getByText(/18:00 - 22:00/)).toBeInTheDocument();
    expect(screen.getByText(/Clubheim/)).toBeInTheDocument();
    expect(screen.getByText(/Anmeldung bis/)).toBeInTheDocument();
    expect(screen.getByText(/2 von 20/)).toBeInTheDocument();
  });

  it('renders only the fields that exist on the event in the details block', () => {
    mocks.useEvent.mockReturnValue({ data: detail({ event: { ...detail().event, description: null, start_time: null, end_time: null, location: null, signup_deadline: null, capacity: null } }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);

    expect(screen.queryByText(/Anmeldung bis/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clubheim/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Belegt:/)).not.toBeInTheDocument();
    expect(screen.getByText(/12\. Juli 2099/)).toBeInTheDocument();
  });

  it('shows the Belegt row only when the event has a capacity', () => {
    mocks.useEvent.mockReturnValue({ data: detail(), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);
    expect(screen.getByText(/2 von 20/)).toBeInTheDocument();
  });

  it('renders a single available time without a leading separator when only end_time exists', () => {
    mocks.useEvent.mockReturnValue({ data: detail({ event: { ...detail().event, start_time: null, end_time: '22:00' } }), isLoading: false, error: null });
    render(<EventSignupModal eventId={1} isOpen onClose={vi.fn()} />);

    expect(screen.getByText(/Zeit:/)).toBeInTheDocument();
    expect(screen.queryByText(/ - 22:00/)).not.toBeInTheDocument();
    expect(screen.getByText('22:00')).toBeInTheDocument();
  });
});
