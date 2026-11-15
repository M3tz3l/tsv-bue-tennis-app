import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMemberCounts: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../services/backendService', () => ({
  default: { getMemberCounts: mocks.getMemberCounts },
}));

import MailComposer, {
  mergeAttachments,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENT_SIZE,
} from './MailComposer';

describe('MailComposer member counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', name: 'Orga' }, logout: vi.fn() });
    mocks.getMemberCounts.mockResolvedValue({ success: true, data: { all: 10, orga: 3 } });
  });

  it('does not fetch member counts while the composer is closed', () => {
    render(<MailComposer isOpen={false} onClose={vi.fn()} />);
    expect(mocks.getMemberCounts).not.toHaveBeenCalled();
  });

  it('fetches member counts once when the composer opens', () => {
    const onClose = vi.fn();
    const { rerender } = render(<MailComposer isOpen={false} onClose={onClose} />);

    rerender(<MailComposer isOpen onClose={onClose} />);

    expect(mocks.getMemberCounts).toHaveBeenCalledTimes(1);
  });

  it('warns when the recipient count cannot be loaded', async () => {
    mocks.getMemberCounts.mockResolvedValue({ success: false, message: 'nope' });
    render(<MailComposer isOpen onClose={vi.fn()} />);

    expect(await screen.findByText(/Empfängerzahl konnte nicht geladen werden/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Empfängerzahl konnte nicht geladen werden/i);
  });
});

const fileWithSize = (name: string, size: number): File => {
  const value = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(value, 'size', { value: size });
  return value;
};

describe('mergeAttachments', () => {
  it('accepts files within the limits', () => {
    const result = mergeAttachments([fileWithSize('a.txt', 10)], [fileWithSize('b.txt', 20)]);

    expect(result.error).toBeUndefined();
    expect(result.files).toHaveLength(2);
  });

  it('rejects more than the allowed count', () => {
    const existing = Array.from({ length: MAX_ATTACHMENT_COUNT }, (_, i) =>
      fileWithSize(`${i}.txt`, 1),
    );

    const result = mergeAttachments(existing, [fileWithSize('extra.txt', 1)]);

    expect(result.error).toMatch(new RegExp(`Maximal ${MAX_ATTACHMENT_COUNT}`));
    expect(result.files).toHaveLength(MAX_ATTACHMENT_COUNT);
  });

  it('rejects a file over the per-file limit', () => {
    const result = mergeAttachments([], [fileWithSize('big.bin', MAX_ATTACHMENT_SIZE + 1)]);

    expect(result.error).toMatch(/zu groß/);
    expect(result.files).toHaveLength(0);
  });

  it('rejects a selection over the total limit', () => {
    const result = mergeAttachments([], [
      fileWithSize('a.bin', MAX_TOTAL_ATTACHMENT_SIZE / 2),
      fileWithSize('b.bin', MAX_TOTAL_ATTACHMENT_SIZE / 2),
      fileWithSize('c.bin', 1),
    ]);

    expect(result.error).toMatch(/zusammen/);
    expect(result.files).toHaveLength(0);
  });
});
