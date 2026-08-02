import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useEvents', () => ({
  useCreateEvent: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateEvent: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteEvent: () => ({ mutateAsync: mocks.remove, isPending: false }),
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
    await user.click(screen.getByRole('button', { name: /Aktualisieren/i }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: 4, payload: expect.objectContaining({ status: 'published' }) }));
    await user.click(screen.getByRole('button', { name: /^Löschen$/i }));
    const deleteButtons = screen.getAllByRole('button', { name: /^Löschen$/i });
    await user.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(4));
  });
});
