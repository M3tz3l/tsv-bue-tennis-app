import { useRef, type ChangeEvent } from 'react';
import { PaperClipIcon, TrashIcon } from '@heroicons/react/24/outline';

type MailAttachmentsProps = {
  attachments: File[];
  isBusy: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const MailAttachments = ({ attachments, isBusy, onAdd, onRemove }: MailAttachmentsProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onAdd(Array.from(event.target.files));
      event.target.value = '';
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--body)] mb-2">Anhänge</label>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
        className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-[var(--hairline-strong)] rounded-lg text-sm text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary-text)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                <span className="text-[var(--muted-soft)]">({formatFileSize(file.size)})</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
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
  );
};

export default MailAttachments;
