type MailPreviewProps = {
  subject: string;
  message: string;
  senderFirstName: string;
  includeGreeting: boolean;
};

const MailPreview = ({
  subject,
  message,
  senderFirstName,
  includeGreeting,
}: MailPreviewProps) => (
  <div className="bg-white rounded-lg border border-[var(--hairline)] p-4 text-sm text-[var(--ink)]">
    <p className="font-medium mb-3">{subject.trim() || 'Kein Betreff'}</p>
    {includeGreeting && <p className="text-[var(--body)] mb-1">Hallo [Vorname],</p>}
    <p className="whitespace-pre-wrap text-[var(--body)]">
      {message.trim() || 'Ihre Nachricht erscheint hier...'}
    </p>
    <div className="mt-4 pt-3 border-t border-[var(--hairline-soft)] text-sm text-[var(--body)]">
      <p className="mb-1">mit sportlichen Grüßen,</p>
      <p className="mb-3">{senderFirstName} / die Abteilungsleitung</p>
      <p className="font-semibold text-[var(--ink)]">Tennisabteilung des TSV Bad Überkingen</p>
      <a
        href="mailto:tennisabteilung@tsv-bad-ueberkingen.de"
        className="text-[var(--primary-text)] hover:underline"
      >
        tennisabteilung@tsv-bad-ueberkingen.de
      </a>
    </div>
  </div>
);

export default MailPreview;
