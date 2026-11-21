import React, { useEffect, useRef, useState } from 'react';
import { DialogTitle } from '@headlessui/react';
import {
  PaperAirplaneIcon,
  EnvelopeIcon,
  UserGroupIcon,
  UsersIcon,
  PaperClipIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import BackendService from '../services/backendService';
import { useAuth } from '../context/AuthContext';
import { buttonVariants } from '../styles/tokens';
import ModalShell from './ModalShell';
import MailAttachments from './MailAttachments';
import MailPreview from './MailPreview';
import MailEditor from './MailEditor';
import { useMailSend } from '../hooks/useMailSend';

interface MailComposerProps {
  isOpen: boolean;
  onClose: () => void;
}

// Keep in sync with backend/src/routes/mail.rs
export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024;

/** Merges new files into the current selection, or explains why it cannot. */
export function mergeAttachments(
  current: File[],
  added: File[],
): { files: File[]; error?: string } {
  if (added.length === 0) return { files: current };

  const next = [...current, ...added];
  if (next.length > MAX_ATTACHMENT_COUNT) {
    return { files: current, error: `Maximal ${MAX_ATTACHMENT_COUNT} Anhänge.` };
  }

  const tooLarge = added.find((file) => file.size > MAX_ATTACHMENT_SIZE);
  if (tooLarge) {
    return {
      files: current,
      error: `"${tooLarge.name}" ist zu groß (max. ${MAX_ATTACHMENT_SIZE / (1024 * 1024)} MB).`,
    };
  }

  const total = next.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_ATTACHMENT_SIZE) {
    return {
      files: current,
      error: `Anhänge dürfen zusammen höchstens ${MAX_TOTAL_ATTACHMENT_SIZE / (1024 * 1024)} MB groß sein.`,
    };
  }

  return { files: next };
}

const MailComposer: React.FC<MailComposerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const senderFirstName = user?.name?.split(' ')[0] || 'Ihr Name';

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [messageHtml, setMessageHtml] = useState('');
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'orga'>('all');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [memberCounts, setMemberCounts] = useState({ all: 0, orga: 0 });
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [countsError, setCountsError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [includeGreeting, setIncludeGreeting] = useState(true);
  const confirmRefreshRef = useRef(false);
  const confirmRequestRef = useRef(0);
  const previewRequestRef = useRef(0);

  const resetForm = () => {
    setSubject('');
    setMessage('');
    setMessageHtml('');
    setPreviewHtml('');
    setPreviewError(false);
    setRecipientFilter('all');
    setAttachments([]);
    setConfirmSend(false);
    setPreviewOpen(false);
  };

  const {
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
  } = useMailSend({ onClose, onFinished: resetForm });

  const closeComposer = () => {
    if (isBusy) return;
    confirmRequestRef.current += 1;
    setConfirmSend(false);
    handleClose();
  };

  useEffect(() => {
    if (!isOpen || countsLoaded) return;
    const fetchCounts = async () => {
      try {
        const response = await BackendService.getMemberCounts();
        if (response.success && response.data) {
          setMemberCounts(response.data);
          setCountsLoaded(true);
          setCountsError(false);
        } else {
          setCountsError(true);
        }
      } catch (error) {
        console.error('Failed to fetch member counts:', error);
        setCountsError(true);
      }
    };

    void fetchCounts();
  }, [isOpen, countsLoaded]);

  // The backend renders the preview with the same greeting/signature templates
  // as the real send, so the two can never drift apart.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      const requestId = ++previewRequestRef.current;
      void BackendService.previewMail({
        message,
        message_html: messageHtml,
        include_greeting: includeGreeting,
        sender_first_name: senderFirstName,
      }).then((response) => {
        if (requestId !== previewRequestRef.current) return;
        if (response.success && response.html) {
          setPreviewHtml(response.html);
          setPreviewError(false);
        } else {
          setPreviewError(true);
        }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [isOpen, message, messageHtml, includeGreeting, senderFirstName]);

  useEffect(() => {
    setConfirmSend(false);
  }, [subject, message, recipientFilter, attachments]);

  const addAttachments = (files: File[]) => {
    const { files: next, error } = mergeAttachments(attachments, files);
    if (error) {
      toast.error(error);
      return;
    }
    setAttachments(next);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

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
      addAttachments(Array.from(e.dataTransfer.files));
    }
  };

  const currentRecipientCount =
    countsLoaded && !countsError
      ? recipientFilter === 'all'
        ? memberCounts.all
        : memberCounts.orga
      : null;

  const isFormValid = subject.trim().length > 0 && message.trim().length > 0;

  const openConfirm = async () => {
    if (!isFormValid || confirmRefreshRef.current) return;
    confirmRefreshRef.current = true;
    const requestId = ++confirmRequestRef.current;
    // Recipients may have changed since the composer opened.
    try {
      const response = await BackendService.getMemberCounts();
      if (response.success && response.data) {
        setMemberCounts(response.data);
        setCountsLoaded(true);
        setCountsError(false);
      } else {
        setCountsError(true);
      }
    } catch {
      setCountsError(true);
    } finally {
      confirmRefreshRef.current = false;
    }
    if (requestId !== confirmRequestRef.current) return;
    setConfirmSend(true);
  };

  // A job id exists but no status snapshot was ever received (e.g. the first
  // poll failed). Keep the send blocked and let the user retry the status.
  if (!activeJob && pendingJobId) {
    return (
      <ModalShell
        isOpen={isOpen}
        onClose={closeComposer}
        title="Mail versenden"
        disableClose={isBusy}
        widthClassName="max-w-lg"
        footer={(
          <button onClick={closeComposer} disabled={isBusy} className={buttonVariants.secondary}>
            {statusRetryError ? 'Schließen' : 'Abbrechen'}
          </button>
        )}
      >
        <div className="px-6 py-8 text-center">
          {statusRetryError ? (
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-[var(--error)]" />
          ) : (
            <div className="mx-auto h-12 w-12 flex items-center justify-center">
              <div className="animate-spin h-10 w-10 border-4 border-[var(--primary)] border-t-transparent rounded-full" />
            </div>
          )}
          <h3 className="mt-4 text-lg font-medium text-[var(--ink)]">
            {statusRetryError ? 'Versandstatus nicht erreichbar' : 'Versandstatus wird geprüft...'}
          </h3>
          {statusRetryError && (
            <div className="mt-4 rounded-md bg-[var(--canvas-soft)] p-3 text-left">
              <p className="text-sm text-[var(--body)]">
                Der Versand läuft möglicherweise weiter. Starten Sie keine neue Rundmail, bevor der Status geklärt ist.
              </p>
              <button
                type="button"
                onClick={() => void retryStatus()}
                disabled={isRetryingStatus}
                className={`${buttonVariants.secondary} mt-3`}
              >
                {isRetryingStatus ? 'Status wird geprüft...' : 'Status erneut prüfen'}
              </button>
            </div>
          )}
        </div>
      </ModalShell>
    );
  }

  // During active job: show progress view
  if (activeJob) {
    return (
      <ModalShell isOpen={isOpen} onClose={closeComposer} title="Mail versenden" disableClose={isBusy} widthClassName="max-w-lg" headerContent={(
            <div className="flex items-center gap-3">
              <div className="bg-[var(--primary)]/10 p-2 rounded-lg"><EnvelopeIcon className="h-6 w-6 text-[var(--primary-text)]" /></div>
              <DialogTitle className="text-lg font-extrabold text-[var(--ink)]">Mail versenden</DialogTitle>
            </div>
          )} footer={(
            <button onClick={closeComposer} disabled={isBusy} className={buttonVariants.secondary}>
              {activeJob.status === 'completed' || activeJob.status === 'failed' || statusRetryError ? 'Schließen' : 'Abbrechen'}
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
                <div className="mt-6" role="progressbar" aria-valuemin={0} aria-valuemax={activeJob.total_recipients} aria-valuenow={Math.min(activeJob.total_recipients, activeJob.sent + activeJob.failed)} aria-label="Versandfortschritt">
                  <div className="flex justify-between text-sm text-[var(--muted)] mb-2" aria-live="polite">
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

                {statusRetryError && (
                  <div className="mt-4 rounded-md bg-[var(--canvas-soft)] p-3 text-left">
                    <p className="text-sm text-[var(--body)]">
                      Der Versandstatus ist derzeit nicht erreichbar. Der Versand läuft möglicherweise weiter.
                      Starten Sie keine neue Rundmail, bevor der Status geklärt ist.
                    </p>
                    <button
                      type="button"
                      onClick={() => void retryStatus()}
                      disabled={isRetryingStatus}
                      className={`${buttonVariants.secondary} mt-3`}
                    >
                      {isRetryingStatus ? 'Status wird geprüft...' : 'Status erneut prüfen'}
                    </button>
                  </div>
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
      onClose={closeComposer}
      title="Rundmail versenden"
      disableClose={isBusy}
      widthClassName="max-w-4xl"
      panelClassName="max-h-[90dvh] min-h-[60dvh] flex flex-col overflow-hidden"
      panelProps={{ onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop }}
      headerContent={(
        <div className="flex items-center gap-3">
          <div className="bg-[var(--primary)]/10 p-2 rounded-lg"><EnvelopeIcon className="h-6 w-6 text-[var(--primary-text)]" /></div>
          <DialogTitle className="text-lg font-extrabold text-[var(--ink)]">Rundmail versenden</DialogTitle>
        </div>
      )}
      headerClassName="shrink-0 bg-[var(--primary)]/5"
      footerClassName="shrink-0 bg-[var(--canvas-soft)] flex-col items-stretch sm:flex-row sm:items-center"
      footer={(
        <>
          <div className="flex w-full items-center gap-2 sm:mr-auto sm:w-auto sm:gap-3">
            <button onClick={closeComposer} className={`${buttonVariants.secondary} max-sm:hidden`} disabled={isBusy}>Abbrechen</button>
            <button onClick={() => void sendTest(subject, message, messageHtml, attachments, includeGreeting)} disabled={isBusy || !isFormValid} className={`${buttonVariants.secondary} inline-flex flex-1 items-center justify-center sm:flex-none`}>{isSendingTest ? 'Wird gesendet...' : 'Test-Mail senden'}</button>
          </div>
          {confirmSend ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm text-[var(--muted)]">{currentRecipientCount === null ? 'An die ausgewählten Mitglieder senden?' : `An ${currentRecipientCount} ${recipientFilter === 'all' ? 'Mitglieder' : 'Ausschuss-Mitglieder'} senden?`}</span>
              <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
                <button onClick={() => setConfirmSend(false)} disabled={isBusy} className={`${buttonVariants.secondary} flex-1 sm:flex-none`}>Zurück</button>
                <button onClick={() => { setConfirmSend(false); void sendBulk(subject, message, messageHtml, recipientFilter, attachments, includeGreeting); }} disabled={isBusy || sendBlocked} className={`${buttonVariants.primary} inline-flex flex-1 items-center justify-center sm:flex-none`}><PaperAirplaneIcon className="-ml-1 mr-2 h-4 w-4" />Jetzt senden</button>
              </div>
            </div>
          ) : (
            <button onClick={() => void openConfirm()} disabled={isBusy || sendBlocked || !isFormValid} className={`${buttonVariants.primary} inline-flex w-full items-center justify-center sm:w-auto`}><PaperAirplaneIcon className="-ml-1 mr-2 h-4 w-4" />{isLoading ? 'Wird gestartet...' : 'Versenden'}{currentRecipientCount !== null && <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-[var(--on-primary)]/25 text-[var(--on-primary)]">{currentRecipientCount}</span>}</button>
          )}
        </>
      )}
    >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-20 bg-[var(--primary)]/5 border-2 border-dashed border-[var(--primary)] rounded-xl flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <PaperClipIcon className="mx-auto h-12 w-12 text-[var(--primary-text)]" />
                <p className="mt-2 text-lg font-medium text-[var(--primary-text)]">
                  Dateien hier ablegen
                </p>
              </div>
            </div>
          )}

          {/* Content: single-column mobile, two-column desktop */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 md:flex-row">
              {/* Form inputs */}
              <div className="flex-1 min-w-0 space-y-4">
                {/* Recipient Filter */}
                <div>
                  <label className="block text-sm font-medium text-[var(--body)] mb-2">
                    Empfängergruppe
                  </label>
                  <p role="status" aria-live="polite" className="mb-2 text-xs text-[var(--error)]">
                    {countsError ? 'Empfängerzahl konnte nicht geladen werden.' : ''}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => setRecipientFilter('all')}
                      disabled={isBusy}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-3 text-sm font-medium transition-all sm:gap-2 sm:px-4 ${
                        recipientFilter === 'all'
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary-text)]'
                          : 'border-[var(--hairline)] hover:border-[var(--hairline-strong)] hover:bg-[var(--canvas-soft)] text-[var(--body)]'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <UsersIcon className="hidden h-4 w-4 sm:block" />
                      <span>Alle</span>
                      {countsLoaded && !countsError && (
                        <span
                          className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                            recipientFilter === 'all'
                              ? 'bg-[var(--primary)]/15 text-[var(--primary-text)]'
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
                      className={`flex items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-3 text-sm font-medium transition-all sm:gap-2 sm:px-4 ${
                        recipientFilter === 'orga'
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary-text)]'
                          : 'border-[var(--hairline)] hover:border-[var(--hairline-strong)] hover:bg-[var(--canvas-soft)] text-[var(--body)]'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <UserGroupIcon className="hidden h-4 w-4 sm:block" />
                      <span>Ausschuss</span>
                      {countsLoaded && !countsError && (
                        <span
                          className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                            recipientFilter === 'orga'
                              ? 'bg-[var(--primary)]/15 text-[var(--primary-text)]'
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
                  <label htmlFor="mail-subject" className="sr-only">
                    Betreff
                  </label>
                  <input
                    id="mail-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Betreff"
                    className="w-full px-3 py-2.5 border border-[var(--hairline-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-base sm:text-sm"
                    disabled={isBusy}
                  />
                </div>

                {/* Message */}
                <div>
                  <label id="mail-message-label" className="sr-only">
                    Nachricht
                  </label>
                  <div className="overflow-hidden rounded-lg border border-[var(--hairline-strong)] bg-white focus-within:border-transparent focus-within:ring-2 focus-within:ring-[var(--primary)]">
                    {isOpen && (
                      <MailEditor
                        initialHtml={messageHtml}
                        onChange={(html, text) => {
                          setMessageHtml(html);
                          setMessage(text);
                        }}
                        disabled={isBusy}
                        labelId="mail-message-label"
                      />
                    )}
                  </div>
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

                <MailAttachments
                  attachments={attachments}
                  isBusy={isBusy}
                  onAdd={addAttachments}
                  onRemove={removeAttachment}
                />
              </div>

              {/* Preview panel */}
              <div className="md:w-[22rem] shrink-0 flex flex-col">
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
                      <MailPreview subject={subject} html={previewHtml} error={previewError} />
                    </div>
                  )}
                </div>

                {/* Desktop: sticky preview */}
                <div className="hidden md:flex md:flex-col md:sticky md:top-0">
                  <label className="block text-sm font-medium text-[var(--body)] mb-2">
                    Vorschau
                  </label>
                  <div className="flex-1 border border-[var(--hairline)] rounded-lg bg-[var(--canvas-soft)] p-4 overflow-y-auto">
                    <MailPreview subject={subject} html={previewHtml} error={previewError} />
                  </div>
                </div>
              </div>
            </div>
          </div>

    </ModalShell>
  );
};

export default MailComposer;
