import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ModalShell from './ModalShell';

describe('ModalShell', () => {
  it('renders the title, children, and footer when open', () => {
    render(
      <ModalShell isOpen title="Beispiel" onClose={vi.fn()} footer={<button>Speichern</button>}>
        <p>Inhalt</p>
      </ModalShell>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Beispiel')).toBeInTheDocument();
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });

  it('calls onClose when the labeled close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ModalShell isOpen title="Beispiel" onClose={onClose} footer={null}>
        <p>Inhalt</p>
      </ModalShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('applies a blurred backdrop', () => {
    render(
      <ModalShell isOpen title="Beispiel" onClose={vi.fn()} footer={null} backdropTestId="modal-shell-backdrop">
        <p>Inhalt</p>
      </ModalShell>,
    );
    const backdrop = screen.getByTestId('modal-shell-backdrop');
    expect(backdrop?.className).toMatch(/backdrop-blur-sm/);
  });

  it('keeps footer controls in the supplied order', () => {
    render(
      <ModalShell
        isOpen
        title="Beispiel"
        onClose={vi.fn()}
        footer={<><button>Abbrechen</button><button>Speichern</button></>}
      >
        <p>Inhalt</p>
      </ModalShell>,
    );
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '',
      'Abbrechen',
      'Speichern',
    ]);
  });
});
