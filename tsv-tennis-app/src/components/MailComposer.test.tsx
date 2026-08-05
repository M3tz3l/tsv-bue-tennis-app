import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMemberCounts: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../services/backendService', () => ({
  default: { getMemberCounts: mocks.getMemberCounts },
}));

import MailComposer from './MailComposer';

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
});
