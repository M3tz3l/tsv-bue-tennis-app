import TopbarNavigation from './TopbarNavigation';
import MailComposer from './MailComposer';

interface DashboardShellProps {
  children: React.ReactNode;
  title: string;
  onOpenMailComposer: () => void;
  isMailComposerOpen: boolean;
  onCloseMailComposer: () => void;
}

const DashboardShell = ({ children, title, onOpenMailComposer, isMailComposerOpen, onCloseMailComposer }: DashboardShellProps) => {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <TopbarNavigation onOpenMailComposer={onOpenMailComposer} />
      <div data-testid="dashboard-shell-content" className="min-w-0 pt-12">
        <main className="mx-auto min-w-0 max-w-7xl px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
          <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-[var(--ink)]">{title}</h1>
          {children}
        </main>
      </div>
      <MailComposer isOpen={isMailComposerOpen} onClose={onCloseMailComposer} />
    </div>
  );
};

export default DashboardShell;
