import { useAuth } from '../context/AuthContext';
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
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <TopbarNavigation onOpenMailComposer={onOpenMailComposer} />
      <div data-testid="dashboard-shell-content" className="min-w-0 pt-16">
        <header className="border-b border-[var(--hairline)] bg-white">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row sm:px-6 lg:px-8">
            <h1 className="text-center text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-left">{title}</h1>
            <span className="text-center text-xs text-[var(--muted)] sm:text-sm">Willkommen, {user?.name || user?.email || 'Benutzer'}</span>
          </div>
        </header>
        <main className="mx-auto min-w-0 max-w-7xl px-3 py-4 sm:px-4 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
      <MailComposer isOpen={isMailComposerOpen} onClose={onCloseMailComposer} />
    </div>
  );
};

export default DashboardShell;
