import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import BackendService, { getApiErrorMessage } from '../services/backendService';
import type { MailJob, SendBulkMailRequest } from '../types';

const MAX_POLL_FAILURES = 20;

type UseMailSendOptions = {
  onClose: () => void;
  /** Reset the composer's form after a successful send. */
  onFinished: () => void;
};

/** Owns the bulk/test send state, job polling and the active-send guard. */
export function useMailSend({ onClose, onFinished }: UseMailSendOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [activeJob, setActiveJob] = useState<MailJob | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [statusRetryError, setStatusRetryError] = useState(false);
  const [isRetryingStatus, setIsRetryingStatus] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailuresRef = useRef(0);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      const response = await BackendService.getMailJobStatus(jobId);
      // A response that lands after unmount must not schedule more work or
      // fire toasts/callbacks.
      if (!mountedRef.current) return;
      if (response.success && response.job) {
        pollFailuresRef.current = 0;
        setActiveJob(response.job);
        if (response.job.status === 'completed' || response.job.status === 'failed') {
          if (pollingRef.current) {
            clearTimeout(pollingRef.current);
            pollingRef.current = null;
          }
          setIsLoading(false);
          setPendingJobId(null);
          setStatusRetryError(false);
          const job = response.job;
          if (job.status === 'failed') {
            toast.error(
              job.error ||
                `Mail-Versand fehlgeschlagen (${job.failed}/${job.total_recipients} fehlgeschlagen)`,
            );
          } else if (job.failed === 0) {
            toast.success(`Mail versandt an ${job.sent} Empfänger!`);
          } else {
            toast.warning(
              `Mail versandt an ${job.sent} von ${job.total_recipients} Empfängern (${job.failed} fehlgeschlagen)`,
            );
          }
          // Reset form after a short delay so user can see the final status.
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = setTimeout(() => {
            resetTimeoutRef.current = null;
            setActiveJob(null);
            setPendingJobId(null);
            setStatusRetryError(false);
            onFinished();
            onClose();
          }, 2000);
        }
        if (response.job.status !== 'completed' && response.job.status !== 'failed') {
          pollingRef.current = setTimeout(() => void pollJobStatus(jobId), 1500);
        }
      } else if (response.status === 429 || (response.status ?? 0) >= 500) {
        // Keep the progress view alive and retry, but give up after a bounded
        // number of attempts so the modal cannot stay locked open forever.
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current > MAX_POLL_FAILURES) {
          if (pollingRef.current) {
            clearTimeout(pollingRef.current);
            pollingRef.current = null;
          }
          // Keep the accepted job id and progress view: the send may still be
          // running server-side, so a new submission must stay blocked.
          setIsLoading(false);
          setStatusRetryError(true);
          toast.error('Versandstatus nicht erreichbar. Der Versand läuft möglicherweise weiter.');
        } else {
          pollingRef.current = setTimeout(() => void pollJobStatus(jobId), 1500);
        }
      } else {
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        setIsLoading(false);
        setStatusRetryError(true);
        toast.error(
          response.message ||
            'Versandstatus nicht erreichbar. Der Versand läuft möglicherweise weiter.',
        );
      }
    },
    [onClose, onFinished],
  );

  const sendBlocked = pendingJobId !== null;
  const isBusy = isLoading || isSendingTest || (sendBlocked && !statusRetryError);

  const handleClose = useCallback(() => {
    if (isBusy) return;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    // After a status failure keep the job so reopening shows its status.
    if (!statusRetryError) {
      setActiveJob(null);
      setPendingJobId(null);
    }
    setIsLoading(false);
    onClose();
  }, [isBusy, statusRetryError, onClose]);

  const retryStatus = useCallback(async () => {
    if (!pendingJobId) return;
    setIsRetryingStatus(true);
    pollFailuresRef.current = 0;
    setStatusRetryError(false);
    await pollJobStatus(pendingJobId);
    setIsRetryingStatus(false);
  }, [pendingJobId, pollJobStatus]);

  const sendTest = useCallback(
    async (subject: string, message: string, attachments: File[], includeGreeting: boolean) => {
      if (!subject.trim() || !message.trim()) {
        toast.error('Betreff und Nachricht sind erforderlich');
        return;
      }

      setIsSendingTest(true);
      try {
        const response = await BackendService.sendTestMail(
          { subject: subject.trim(), message: message.trim() },
          attachments.length > 0 ? attachments : undefined,
          includeGreeting,
        );
        if (response.success) {
          toast.success('Test-Mail gesendet!');
        } else {
          toast.error(response.message || 'Fehler beim Versenden der Test-Mail');
        }
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Fehler beim Versenden der Test-Mail'));
      } finally {
        setIsSendingTest(false);
      }
    },
    [],
  );

  const sendBulk = useCallback(
    async (
      subject: string,
      message: string,
      recipientFilter: 'all' | 'orga',
      attachments: File[],
      includeGreeting: boolean,
    ) => {
      if (!subject.trim() || !message.trim()) {
        toast.error('Betreff und Nachricht sind erforderlich');
        return;
      }
      if (pendingJobId) {
        toast.error('Ein Versand wird noch verarbeitet. Bitte prüfen Sie dessen Status.');
        return;
      }

      setIsLoading(true);
      setActiveJob(null);
      try {
        const payload: SendBulkMailRequest = {
          subject: subject.trim(),
          message: message.trim(),
          recipient_filter: recipientFilter,
        };
        const response = await BackendService.sendBulkMail(
          payload,
          attachments.length > 0 ? attachments : undefined,
          includeGreeting,
        );

        if (response.success) {
          const jobId = response.job_id;
          const total = response.total_recipients ?? 0;
          if (!jobId) {
            toast.error('Fehler beim Versenden der Mail');
            setIsLoading(false);
            return;
          }
          toast.info(`Mail-Versand gestartet für ${total} Empfänger...`);
          pollFailuresRef.current = 0;
          setPendingJobId(jobId);
          setStatusRetryError(false);
          void pollJobStatus(jobId);
        } else {
          toast.error(response.message || 'Fehler beim Versenden der Mail');
          setIsLoading(false);
        }
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Fehler beim Versenden der Mail'));
        setIsLoading(false);
      }
    },
    [pendingJobId, pollJobStatus],
  );

  return {
    isLoading,
    isSendingTest,
    activeJob,
    pendingJobId,
    statusRetryError,
    isRetryingStatus,
    isBusy,
    sendBlocked,
    handleClose,
    retryStatus,
    sendTest,
    sendBulk,
  };
}
