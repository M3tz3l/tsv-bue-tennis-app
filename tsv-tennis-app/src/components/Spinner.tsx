type SpinnerProps = {
  className?: string;
  label?: string;
  /** Render as a centered full-page loader (used by auth guards). */
  fullPage?: boolean;
};

/** Shared loading spinner, with an optional text label. */
const Spinner = ({ className = 'h-8 w-8', label, fullPage = false }: SpinnerProps) => {
  const spinner = (
    <div className="flex items-center justify-center gap-3 py-8">
      <div className={`animate-spin rounded-full border-b-2 border-[var(--primary)] ${className}`} role="status" aria-label={label || 'Wird geladen'} />
      {label && <span className="text-sm text-[var(--muted)]">{label}</span>}
    </div>
  );

  if (!fullPage) return spinner;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--canvas)]">
      {spinner}
    </div>
  );
};

export default Spinner;
