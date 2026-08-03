import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  pending: false,
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useEvents', () => ({
  useCreateEvent: () => ({ mutateAsync: mocks.create, isPending: mocks.pending }),
  useUpdateEvent: () => ({ mutateAsync: mocks.update, isPending: mocks.pending }),
  useDeleteEvent: () => ({ mutateAsync: mocks.remove, isPending: mocks.pending }),
}));
vi.mock('react-toastify', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import EventFormModal from './EventFormModal';

const event = {
  id: 4, type: 'event' as const, title: 'Sommerfest', description: 'Abend', event_date: '2099-07-12',
  start_time: null, end_time: '22:00', location: 'Clubheim', signup_deadline: null, capacity: null,
  allow_salad: true, allow_cake: false, status: 'draft' as const, signup_people_count: 0,
};

describe('EventFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending = false;
    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', role: 'orga' } });
    mocks.create.mockResolvedValue(event);
    mocks.update.mockResolvedValue(event);
    mocks.remove.mockResolvedValue({ success: true });
  });

  it('does not render management UI for regular members', () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1', role: 'member' } });
    render(<EventFormModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a draft with independent optional times and event options', async () => {
    const user = userEvent.setup();
    render(<EventFormModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/Titel/i), 'Sommerfest');
    await user.type(screen.getByLabelText(/Datum/i), '2099-07-12');
    await user.type(screen.getByLabelText(/Endzeit/i), '22:00');
    await user.type(screen.getByLabelText(/Beschreibung/i), 'Abend');
    await user.type(screen.getByLabelText(/Ort/i), 'Clubheim');
    await user.click(screen.getByLabelText(/Salat anbieten/i));
    await user.click(screen.getByRole('button', { name: /Erstellen/i }));

    expect(mocks.create).toHaveBeenCalledWith({
      type: 'event', title: 'Sommerfest', description: 'Abend', event_date: '2099-07-12',
      start_time: null, end_time: '22:00', location: 'Clubheim', signup_deadline: null,
      capacity: null, allow_salad: true, allow_cake: false, status: 'draft',
    });
  });

  it('publishes an edited event and confirms deletion', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EventFormModal isOpen onClose={onClose} initialData={event} />);
    await user.click(screen.getByLabelText(/Veröffentlicht/i));
    await waitFor(() => expect(screen.getByRole('button', { name: /Aktualisieren/i })).toBeInTheDocument());
    fireEvent.submit(document.getElementById('event-form')!);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: 4, payload: expect.objectContaining({ status: 'published' }) }));
    await user.click(screen.getByRole('button', { name: /^Löschen$/i }));
    const deleteButtons = screen.getAllByRole('button', { name: /^Löschen$/i });
    await user.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(4));
  });

  it('sends clear_fields when optional edited values are cleared', async () => {
    const user = userEvent.setup();
    render(<EventFormModal isOpen onClose={vi.fn()} initialData={event} />);
    await user.clear(screen.getByLabelText(/Endzeit/i));
    await user.clear(screen.getByLabelText(/Beschreibung/i));
    await user.click(screen.getByRole('button', { name: /Aktualisieren/i }));

    expect(mocks.update).toHaveBeenCalledWith({
      id: 4,
      payload: expect.objectContaining({
        clear_fields: expect.arrayContaining(['description', 'end_time']),
      }),
    });
  });

  it('rejects invalid time, deadline, and capacity values before mutation', async () => {
    render(<EventFormModal isOpen onClose={vi.fn()} initialData={{ ...event, start_time: '18:00', end_time: '17:00', signup_deadline: '2099-07-13', capacity: 0 }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Aktualisieren/i })).toBeInTheDocument());
    fireEvent.submit(document.getElementById('event-form')!);
    expect(mocks.update).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/Zeit|Kapazität/i)));
  });

  it('keeps the outer dialog open while a mutation is pending', async () => {
    mocks.pending = true;
    const onClose = vi.fn();
    render(<EventFormModal isOpen onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Abbrechen/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Abbrechen/i })).toBeDisabled();
  });

  it('uses shared minimum touch and action control classes and accessibility styles', () => {
    render(<EventFormModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveClass('touch-control');
    expect(screen.getByRole('button', { name: /Abbrechen/i })).toHaveClass('action-control');
    
    const submitBtn = screen.getByRole('button', { name: /Erstellen/i });
    expect(submitBtn).toHaveClass('action-control');
    expect(submitBtn).toHaveClass('bg-emerald-700');
    expect(submitBtn).toHaveClass('hover:bg-emerald-800');

    // Inputs have touch targets
    const titleInput = screen.getByLabelText(/Titel/i);
    expect(titleInput).toHaveClass('min-h-[44px]');
    
    // Backdrop blur
    const backdrop = screen.getByTestId('modal-backdrop');
    expect(backdrop).toHaveClass('backdrop-blur-sm');
    expect(document.getElementById('event-form')).toHaveClass('stack-md');
  });

  it('uses the destructive token for deleting an existing event', () => {
    render(<EventFormModal isOpen onClose={vi.fn()} initialData={event} />);

    expect(screen.getByRole('button', { name: /^Löschen$/i })).toHaveClass('action-control');
  });

  it('shows mutation errors and keeps the form open', async () => {
    mocks.create.mockRejectedValue(new Error('Serverfehler'));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EventFormModal isOpen onClose={onClose} />);
    await user.type(screen.getByLabelText(/Titel/i), 'Test');
    await user.type(screen.getByLabelText(/Datum/i), '2099-07-12');
    await user.click(screen.getByRole('button', { name: /Erstellen/i }));
    expect(mocks.toastError).toHaveBeenCalledWith('Serverfehler');
    expect(onClose).not.toHaveBeenCalled();
  });
});
