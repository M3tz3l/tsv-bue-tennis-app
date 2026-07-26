import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PaperAirplaneIcon, EnvelopeIcon, UserGroupIcon, UsersIcon, PaperClipIcon, TrashIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import BackendService from '../services/backendService';
import { useAuth } from '../context/AuthContext';
import type { SendBulkMailRequest } from '../types';

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
  const [showBulkConfirmation, setShowBulkConfirmation] = useState(false);
  const [memberCounts, setMemberCounts] = useState({ all: 0, orga: 0 });
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
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

    fetchCounts();
  }, []);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments((prev) => [...prev, ...newFiles]);
      // Reset input so the same file can be selected again
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
      );

      if (response.success) {
        toast.success('Test-Mail gesendet!');
      } else {
        toast.error(response.message || 'Fehler beim Versenden der Test-Mail');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Fehler beim Versenden der Test-Mail');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendBulk = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Betreff und Nachricht sind erforderlich');
      return;
    }

    setShowBulkConfirmation(false);
    setIsLoading(true);
    try {
      const payload: SendBulkMailRequest = {
        subject: subject.trim(),
        message: message.trim(),
        recipient_filter: recipientFilter,
      };

      const response = await BackendService.sendBulkMail(
        payload,
        attachments.length > 0 ? attachments : undefined,
      );

      if (response.success) {
        toast.success(`Mail versandt! ${(response as any).sent} Empfänger.`);
        setSubject('');
        setMessage('');
        setRecipientFilter('all');
        setAttachments([]);
        onClose();
      } else {
        const failedCount = (response as any).failed;
        if (failedCount && failedCount > 0) {
          toast.warning(
            `Mail versandt an ${(response as any).sent} von ${(response as any).sent + failedCount} Empfängern`
          );
        } else {
          toast.error(response.message || 'Fehler beim Versenden der Mail');
        }
      }
    } catch (error: any) {
      toast.error(error?.message || 'Fehler beim Versenden der Mail');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <EnvelopeIcon className="h-6 w-6 text-purple-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Rundmail versenden</h2>
              <p className="text-sm text-gray-500">Mitteilung an die Vereinsmitglieder</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
            aria-label="Schließen"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row gap-6 p-6 overflow-hidden">
          {/* Left column: inputs */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Recipient Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Empfängergruppe
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRecipientFilter('all')}
                  disabled={isLoading || isSendingTest}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${recipientFilter === 'all'
                    ? 'border-purple-600 bg-purple-50 text-purple-800'
                    : 'border-gray-200 hover:border-purple-300 text-gray-700'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <UsersIcon className="h-4 w-4" />
                  Alle Mitglieder
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientFilter('orga')}
                  disabled={isLoading || isSendingTest}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${recipientFilter === 'orga'
                    ? 'border-purple-600 bg-purple-50 text-purple-800'
                    : 'border-gray-200 hover:border-purple-300 text-gray-700'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <UserGroupIcon className="h-4 w-4" />
                  Nur Ausschuss
                </button>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label htmlFor="mail-subject" className="block text-sm font-medium text-gray-700 mb-1.5">
                Betreff
              </label>
              <input
                id="mail-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="z. B. Einladung zur Jahreshauptversammlung"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isLoading || isSendingTest}
              />
            </div>

            {/* Message */}
            <div>
              <label htmlFor="mail-message" className="block text-sm font-medium text-gray-700 mb-1.5">
                Nachricht
              </label>
              <textarea
                id="mail-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ihre Nachricht an die Mitglieder..."
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                disabled={isLoading || isSendingTest}
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                disabled={isLoading || isSendingTest}
                className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-purple-400 hover:text-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <PaperClipIcon className="h-4 w-4" />
                Dateien anhängen
              </button>
              {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachments.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-sm"
                    >
                      <span className="truncate text-gray-700">
                        {file.name} <span className="text-gray-400">({formatFileSize(file.size)})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="text-gray-400 hover:text-red-600 shrink-0"
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

          {/* Right column: preview */}
          <div className="md:w-80 shrink-0 flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Vorschau
            </label>
            <div className="flex-1 min-h-0 border border-gray-200 rounded-lg bg-gray-50 p-4 overflow-y-auto">
              <div className="bg-white rounded-lg shadow-sm p-4 text-sm text-gray-900">
                <p className="font-medium mb-2">{subject.trim() || 'Kein Betreff'}</p>
                <p className="text-gray-700 mb-2">
                  Hallo Max,
                </p>
                <p className="whitespace-pre-wrap text-gray-700">
                  {message.trim() || 'Ihre Nachricht erscheint hier...'}
                </p>
                <div className="mt-4 pt-3 border-t border-gray-100 text-sm text-gray-700">
                  <p className="mb-1">mit sportlichen Grüßen,</p>
                  <p className="mb-3">{senderFirstName} / die Abteilungsleitung</p>
                  <p className="font-semibold text-gray-900">Tennisabteilung des TSV Bad Überkingen</p>
                  <a
                    href="mailto:tennisabteilung@tsv-bad-ueberkingen.de"
                    className="text-blue-600 hover:underline"
                  >
                    tennisabteilung@tsv-bad-ueberkingen.de
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            disabled={isLoading || isSendingTest}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSendTest}
            disabled={isLoading || isSendingTest || !subject.trim() || !message.trim()}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSendingTest ? 'Test wird versendet...' : 'Test-Mail senden'}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowBulkConfirmation(true)}
              disabled={isLoading || isSendingTest || !subject.trim() || !message.trim()}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PaperAirplaneIcon className="-ml-1 mr-2 h-5 w-5" />
              {isLoading ? 'Wird versendet...' : 'Versenden'}
            </button>
            {showBulkConfirmation && (
              <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-10">
                <p className="text-sm text-gray-700 mb-2">
                  Diese Mail wird an {recipientFilter === 'all' ? 'alle Mitglieder' : 'alle orga-Mitglieder'} versendet.
                  <span className="block mt-1 text-xs text-gray-500">
                    {countsLoaded
                      ? `(${recipientFilter === 'all' ? memberCounts.all : memberCounts.orga} Empfänger)`
                      : '(Empfänger werden geladen...)'}</span>
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowBulkConfirmation(false)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSendBulk}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                  >
                    Bestätigen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MailComposer;
