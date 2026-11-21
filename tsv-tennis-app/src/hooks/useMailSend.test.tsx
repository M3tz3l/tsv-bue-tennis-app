import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMailJobStatus: vi.fn(),
  sendBulkMail: vi.fn(),
  sendTestMail: vi.fn(),
}));

vi.mock('../services/backendService', () => ({
  default: mocks,
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('react-toastify', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { useMailSend } from './useMailSend';

describe('useMailSend job polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears a missing job so a new send is allowed', async () => {
    mocks.sendBulkMail.mockResolvedValue({
      success: true,
      job_id: 'job-1',
      total_recipients: 1,
    });
    mocks.getMailJobStatus.mockResolvedValue({
      success: false,
      status: 404,
      code: 'job_not_found',
      message: 'Job nicht gefunden',
    });

    const { result } = renderHook(() =>
      useMailSend({ onClose: vi.fn(), onFinished: vi.fn() }),
    );

    await act(async () => {
      await result.current.sendBulk('Betreff', 'Text', '<p>Text</p>', 'all', [], true);
    });

    await waitFor(() => expect(result.current.pendingJobId).toBeNull());
    expect(result.current.statusRetryError).toBe(false);
    expect(result.current.sendBlocked).toBe(false);
  });

  it('keeps the send guard for a 404 without the job_not_found code', async () => {
    mocks.sendBulkMail.mockResolvedValue({
      success: true,
      job_id: 'job-1',
      total_recipients: 1,
    });
    mocks.getMailJobStatus.mockResolvedValue({
      success: false,
      status: 404,
      message: 'Not found',
    });

    const { result } = renderHook(() =>
      useMailSend({ onClose: vi.fn(), onFinished: vi.fn() }),
    );

    await act(async () => {
      await result.current.sendBulk('Betreff', 'Text', '<p>Text</p>', 'all', [], true);
    });

    await waitFor(() => expect(result.current.statusRetryError).toBe(true));
    expect(result.current.pendingJobId).toBe('job-1');
    expect(result.current.sendBlocked).toBe(true);
  });
});
