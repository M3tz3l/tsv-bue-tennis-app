type MailPreviewProps = {
  subject: string;
  html: string;
  error?: boolean;
};

const MailPreview = ({ subject, html, error = false }: MailPreviewProps) => (
  <div className="bg-white rounded-lg border border-[var(--hairline)] p-4 text-sm text-[var(--ink)]">
    <p className="font-medium mb-3 break-words">{subject.trim() || 'Kein Betreff'}</p>
    {error ? (
      <p className="text-[var(--muted-soft)]">Vorschau konnte nicht geladen werden.</p>
    ) : html ? (
      <div
        className="break-words text-[var(--body)] [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_a]:text-[var(--primary-text)] [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    ) : (
      <p className="text-[var(--muted-soft)]">Vorschau wird geladen...</p>
    )}
  </div>
);

export default MailPreview;
