import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DialogTitle } from '@headlessui/react';
import {
  PaperAirplaneIcon,
  EnvelopeIcon,
  UserGroupIcon,
  UsersIcon,
  PaperClipIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import BackendService, { getApiErrorMessage } from '../services/backendService';
import { useAuth } from '../context/AuthContext';
import type { SendBulkMailRequest, MailJob } from '../types';
import { buttonVariants } from '../styles/tokens';
import ModalShell from './ModalShell';

interface MailComposerProps {
  isOpen: boolean;
  onClose: () => void;
}

const MailComposer: React.FC<MailComposerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const senderFirstName = user?.name?.split(' ')[0] || 'Ihr Name';

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'orga'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [memberCounts, setMemberCounts] = useState({ all: 0, orga: 0 });
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [activeJob, setActiveJob] = useState<MailJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New state for redesigned UI
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [includeGreeting, setIncludeGreeting] = useState(true);

  useEffect(() => {
    if (!isOpen || countsLoaded) return;
    const fetchCounts = async () => {
      try {
        const response = await BackendService.getMemberCounts();
        if (response.success && response.data) {
          setMemberCounts(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch member counts:', error);
      } finally {
        setCountsLoaded(true);
      }
    };

    void fetchCounts();
  }, [isOpen, countsLoaded]);

  // Clean up polling and reset timeout on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  // Reset confirmSend when inputs change
  useEffect(() => {
    setConfirmSend(false);
  }, [subject, message, recipientFilter, attachments]);

  const pollJobStatus = useCallback(async (jobId: string) => {
    const response = await BackendService.getMailJobStatus(jobId);
    if (response.success && response.job) {
      setActiveJob(response.job);
      if (response.job.status === 'completed' || response.job.status === 'failed') {
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        setIsLoading(false);
        const job = response.job;
        if (job.status === 'failed') {
          toast.error(job.error || `Mail-Versand fehlgeschlagen (${job.failed}/${job.total_recipients} fehlgeschlagen)`);
        } else if (job.failed === 0) {
          toast.success(`Mail versandt an ${job.sent} Empfänger!`);
        } else {
          toast.warning(`Mail versandt an ${job.sent} von ${job.total_recipients} Empfängern (${job.failed} fehlgeschlagen)`);
        }
        // Reset form after a short delay so user can see the final status
        if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = setTimeout(() => {
          resetTimeoutRef.current = null;
          setSubject('');
          setMessage('');
          setRecipientFilter('all');
          setAttachments([]);
          setActiveJob(null);
          setConfirmSend(false);
          onClose();
        }, 2000);
      }
      if (response.job.status !== 'completed' && response.job.status !== 'failed') {
        pollingRef.current = setTimeout(() => void pollJobStatus(jobId), 1500);
      }
    } else if (response.status === 429 || (response.status ?? 0) >= 500) {
      // Transient backend/rate-limit failure: keep the progress view alive
      // and retry instead of tearing down the send flow.
      pollingRef.current = setTimeout(() => void pollJobStatus(jobId), 1500);
    } else {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      setIsLoading(false);
      setActiveJob(null);
      toast.error(response.message || 'Job-Status konnte nicht abgerufen werden');
    }
  }, [onClose]);

  const isBusy = isLoading || isSendingTest || (activeJob !== null && activeJob.status !== 'completed' && activeJob.status !== 'failed');

  const handleClose = () => {
    if (isBusy) return;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    setActiveJob(null);
    setIsLoading(false);
    setConfirmSend(false);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments((prev) => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files);
      setAttachments((prev) => [...prev, ...newFiles]);
    }
  };

  const handleSendTest = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Betreff und Nachricht sind erforderlich');
      return;
    }

    setIsSendingTest(true);
    try {
      const response = await BackendService.sendTestMail(
        {
          subject: subject.trim(),
          message: message.trim(),
        },
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
  };

  const handleSendBulk = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Betreff und Nachricht sind erforderlich');
      return;
    }

    setIsLoading(true);
    setActiveJob(null);
    setConfirmSend(false);
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
        void pollJobStatus(jobId);
      } else {
        toast.error(response.message || 'Fehler beim Versenden der Mail');
        setIsLoading(false);
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Fehler beim Versenden der Mail'));
      setIsLoading(false);
    }
  };

  const currentRecipientCount = countsLoaded
    ? recipientFilter === 'all'
      ? memberCounts.all
      : memberCounts.orga
    : null;

  const isFormValid = subject.trim().length > 0 && message.trim().length > 0;

  // During active job: show progress view
  if (activeJob) {
    return (
      <ModalShell isOpen={isOpen} onClose={handleClose} title="Mail versenden" disableClose={isBusy} widthClassName="max-w-lg" headerContent={(
            <div className="flex items-center gap-3">
              <div className="bg-[var(--primary)]/10 p-2 rounded-lg"><EnvelopeIcon className="h-6 w-6 text-[var(--primary)]" /></div>
              <DialogTitle className="text-lg font-extrabold text-[var(--ink)]">Mail versenden</DialogTitle>
            </div>
          )} footer={(
            <button onClick={handleClose} disabled={isBusy} className={buttonVariants.secondary}>
              {activeJob.status === 'completed' || activeJob.status === 'failed' ? 'Schließen' : 'Abbrechen'}
            </button>
          )}>
            {/* Progress content */}
            <div className="px-6 py-8">
              <div className="text-center">
                {activeJob.status === 'completed' ? (
                  <CheckCircleIcon className="mx-auto h-12 w-12 text-[var(--success)]" />
                ) : activeJob.status === 'failed' ? (
                  <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-[var(--error)]" />
                ) : (
                  <div className="mx-auto h-12 w-12 flex items-center justify-center">
                    <div className="animate-spin h-10 w-10 border-4 border-[var(--primary)] border-t-transparent rounded-full" />
                  </div>
                )}

                <h3 className="mt-4 text-lg font-medium text-[var(--ink)]">
                  {activeJob.status === 'completed'
                    ? 'Versand abgeschlossen'
                    : activeJob.status === 'failed'
                    ? 'Versand fehlgeschlagen'
                    : 'Mails werden versendet...'}
                </h3>

                {/* Progress bar */}
                <div className="mt-6">
                  <div className="flex justify-between text-sm text-[var(--muted)] mb-2">
                    <span>{activeJob.sent} gesendet</span>
                    <span>{activeJob.total_recipients} Empfänger</span>
                  </div>
                  <div className="w-full bg-[var(--hairline-soft)] rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        activeJob.status === 'failed' ? 'bg-[var(--error)]' : 'bg-[var(--primary)]'
                      }`}
                      style={{
                        width: `${
                          activeJob.total_recipients > 0
                            ? Math.min(
                                100,
                                Math.round(
                                  ((activeJob.sent + activeJob.failed) /
                                    activeJob.total_recipients) * 100
                                )
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {activeJob.failed > 0 && (
                  <p className="mt-3 text-sm text-[var(--error)]">
                    {activeJob.failed} fehlgeschlagen
                  </p>
                )}

                {activeJob.status === 'completed' && (
                  <p className="mt-3 text-sm text-[var(--muted)]">Fenster schließt automatisch...</p>
                )}
              </div>
            </div>

      </ModalShell>
    );
  }

  // Main compose view
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title="Rundmail versenden"
      disableClose={isBusy}
      widthClassName="max-w-4xl"
      panelClassName="max-h-[90vh] min-h-[60vh] flex flex-col overflow-hidden"
      panelProps={{ onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop }}
      headerContent={(
        <div className="flex items-center gap-3">
          <div className="bg-[var(--primary)]/10 p-2 rounded-lg"><EnvelopeIcon className="h-6 w-6 text-[var(--primary)]" /></div>
          <DialogTitle className="text-lg font-extrabold text-[var(--ink)]">Rundmail versenden</DialogTitle>
        </div>
      )}
      headerClassName="shrink-0 bg-[var(--primary)]/5"
      footerClassName="shrink-0 bg-[var(--canvas-soft)]"
      footer={(
        <>
          <div className="flex items-center gap-3 mr-auto">
            <button onClick={handleClose} className={buttonVariants.secondary} disabled={isBusy}>Abbrechen</button>
            <button onClick={handleSendTest} disabled={isBusy || !isFormValid} className={`${buttonVariants.secondary} inline-flex items-center justify-center`}>{isSendingTest ? 'Wird gesendet...' : 'Test-Mail senden'}</button>
          </div>
          <div className="flex items-center gap-3">
            {confirmSend ? <>
              <span className="text-sm text-[var(--muted)]">An {currentRecipientCount} {recipientFilter === 'all' ? 'Mitglieder' : 'Ausschuss-Mitglieder'} senden?</span>
              <button onClick={() => setConfirmSend(false)} disabled={isBusy} className={buttonVariants.secondary}>Zurück</button>
              <button onClick={handleSendBulk} disabled={isBusy} className={`${buttonVariants.primary} inline-flex items-center justify-center`}><PaperAirplaneIcon className="-ml-1 mr-2 h-4 w-4" />Jetzt senden</button>
            </> : <button onClick={() => isFormValid && setConfirmSend(true)} disabled={isBusy || !isFormValid} className={`${buttonVariants.primary} inline-flex items-center justify-center`}><PaperAirplaneIcon className="-ml-1 mr-2 h-4 w-4" />{isLoading ? 'Wird gestartet...' : 'Versenden'}{currentRecipientCount !== null && <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-[var(--on-primary)]/25 text-[var(--on-primary)]">{currentRecipientCount}</span>}</button>}
          </div>
        </>
      )}
    >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-20 bg-[var(--primary)]/5 border-2 border-dashed border-[var(--primary)] rounded-xl flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <PaperClipIcon className="mx-auto h-12 w-12 text-[var(--primary)]" />
                <p className="mt-2 text-lg font-medium text-[var(--primary)]">
                  Dateien hier ablegen
                </p>
              </div>
            </div>
          )}

          {/* Content: single-column mobile, two-column desktop */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col md:flex-row gap-6 p-6">
              {/* Form inputs */}
              <div className="flex-1 min-w-0 space-y-5">
                {/* Recipient Filter */}
                <div>
                  <label className="block text-sm font-medium text-[var(--body)] mb-2">
                    Empfängergruppe
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRecipientFilter('all')}
                      disabled={isBusy}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        recipientFilter === 'all'
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)]'
                          : 'border-[var(--hairline)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 text-[var(--body)]'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <UsersIcon className="h-4 w-4" />
                      <span>Alle Mitglieder</span>
                      {countsLoaded && (
                        <span
                          className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                            recipientFilter === 'all'
                              ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                              : 'bg-[var(--canvas-soft)] text-[var(--muted)]'
                          }`}
                        >
                          {memberCounts.all}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientFilter('orga')}
                      disabled={isBusy}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        recipientFilter === 'orga'
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)]'
                          : 'border-[var(--hairline)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 text-[var(--body)]'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <UserGroupIcon className="h-4 w-4" />
                      <span>Nur Ausschuss</span>
                      {countsLoaded && (
                        <span
                          className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                            recipientFilter === 'orga'
                              ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                              : 'bg-[var(--canvas-soft)] text-[var(--muted)]'
                          }`}
                        >
                          {memberCounts.orga}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label htmlFor="mail-subject" className="block text-sm font-medium text-[var(--body)] mb-2">
                    Betreff
                  </label>
                  <input
                    id="mail-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="z. B. Einladung zur Jahreshauptversammlung"
                    className="w-full px-3 py-2.5 border border-[var(--hairline-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-sm"
                    disabled={isBusy}
                  />
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="mail-message" className="block text-sm font-medium text-[var(--body)] mb-2">
                    Nachricht
                  </label>
                  <textarea
                    id="mail-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ihre Nachricht an die Mitglieder..."
                    rows={8}
                    className="w-full px-3 py-2.5 border border-[var(--hairline-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-sm resize-y min-h-[120px]"
                    disabled={isBusy}
                  />
                </div>

                {/* Personal greeting toggle */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeGreeting}
                    aria-labelledby="greeting-switch-label"
                    onClick={() => setIncludeGreeting(!includeGreeting)}
                    disabled={isBusy}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      includeGreeting ? 'bg-[var(--primary)]' : 'bg-[var(--hairline-soft)]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        includeGreeting ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span id="greeting-switch-label" className="text-sm text-[var(--body)]">
                    Persönliche Anrede
                    <span className="text-[var(--muted-soft)] ml-1">(Vorname des Empfängers)</span>
                  </span>
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-sm font-medium text-[var(--body)] mb-2">
                    Anhänge
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-[var(--hairline-strong)] rounded-lg text-sm text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <PaperClipIcon className="h-4 w-4" />
                    Dateien anhängen
                  </button>
                  {attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {attachments.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[var(--canvas-soft)] rounded-lg text-sm"
                        >
                          <span className="truncate text-[var(--body)]">
                            {file.name}{' '}
                            <span className="text-[var(--muted-soft)]">
                              ({formatFileSize(file.size)})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="text-[var(--muted-soft)] hover:text-[var(--error)] shrink-0"
                            aria-label={`Datei ${file.name} entfernen`}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Preview panel */}
              <div className="md:w-72 shrink-0 flex flex-col">
                {/* Mobile: collapsible preview */}
                <div className="md:hidden">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(!previewOpen)}
                    className="flex items-center justify-between w-full text-sm font-medium text-[var(--body)] mb-2 py-2"
                  >
                    <span className="flex items-center gap-2">
                      Vorschau
                      {!previewOpen && subject.trim() && (
                        <span className="text-[var(--muted-soft)] truncate max-w-[200px]">
                          — {subject.trim()}
                        </span>
                      )}
                    </span>
                    {previewOpen ? (
                      <ChevronUpIcon className="h-4 w-4 text-[var(--muted)]" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-[var(--muted)]" />
                    )}
                  </button>
                  {previewOpen && (
                    <div className="border border-[var(--hairline)] rounded-lg bg-[var(--canvas-soft)] p-4 overflow-y-auto max-h-64">
                      <PreviewContent
                        subject={subject}
                        message={message}
                        senderFirstName={senderFirstName}
                        includeGreeting={includeGreeting}
                      />
                    </div>
                  )}
                </div>

                {/* Desktop: sticky preview */}
                <div className="hidden md:flex md:flex-col md:sticky md:top-0">
                  <label className="block text-sm font-medium text-[var(--body)] mb-2">
                    Vorschau
                  </label>
                  <div className="flex-1 border border-[var(--hairline)] rounded-lg bg-[var(--canvas-soft)] p-4 overflow-y-auto">
                    <PreviewContent
                      subject={subject}
                      message={message}
                      senderFirstName={senderFirstName}
                      includeGreeting={includeGreeting}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

    </ModalShell>
  );
};

// Extracted preview content to avoid duplication
const PreviewContent: React.FC<{
  subject: string;
  message: string;
  senderFirstName: string;
  includeGreeting: boolean;
}> = ({ subject, message, senderFirstName, includeGreeting }) => (
  <div className="bg-white rounded-lg border border-[var(--hairline)] p-4 text-sm text-[var(--ink)]">
    <p className="font-medium mb-3">{subject.trim() || 'Kein Betreff'}</p>
    {includeGreeting && <p className="text-[var(--body)] mb-1">Hallo [Vorname],</p>}
    <p className="whitespace-pre-wrap text-[var(--body)]">
      {message.trim() || 'Ihre Nachricht erscheint hier...'}
    </p>
    <div className="mt-4 pt-3 border-t border-[var(--hairline-soft)] text-sm text-[var(--body)]">
      <p className="mb-1">mit sportlichen Grüßen,</p>
      <p className="mb-3">
        {senderFirstName} / die Abteilungsleitung
      </p>
      <p className="font-semibold text-[var(--ink)]">
        Tennisabteilung des TSV Bad Überkingen
      </p>
      <a
        href="mailto:tennisabteilung@tsv-bad-ueberkingen.de"
        className="text-[var(--primary)] hover:underline"
      >
        tennisabteilung@tsv-bad-ueberkingen.de
      </a>
    </div>
  </div>
);

export default MailComposer;
