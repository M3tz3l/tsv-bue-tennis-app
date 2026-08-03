import TSV_Logo from '../assets/TSV_Tennis.svg';
import { useAuth } from '../context/AuthContext';
import ClubNavigation from './ClubNavigation';
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
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 lg:flex">
            <ClubNavigation variant="desktop" onRundmail={onOpenMailComposer} />
            <div className="min-w-0 flex-1">
                <header className="border-b border-gray-200 bg-white shadow-sm">
                    <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row sm:px-6 lg:px-8">
                        <div className="flex items-center gap-4">
                            <img src={TSV_Logo} alt="TSV BÜ Tennis Logo" className="h-16 w-auto drop-shadow-sm sm:h-20" />
                            <h1 className="text-center text-lg font-bold text-gray-900 sm:text-left sm:text-2xl">{title}</h1>
                        </div>
                         <span className="text-center text-xs text-gray-600 sm:text-sm">Willkommen, {user?.name || user?.email || 'Benutzer'}</span>
                    </div>
                </header>
                <main data-testid="dashboard-shell-content" data-mobile-safe-spacing="true" className="mx-auto min-w-0 max-w-7xl px-3 py-4 pb-[var(--club-nav-height)] sm:px-4 sm:py-8 lg:px-8">
                    {children}
                </main>
            </div>
            <ClubNavigation variant="mobile" onRundmail={onOpenMailComposer} />
            <MailComposer isOpen={isMailComposerOpen} onClose={onCloseMailComposer} />
        </div>
    );
};

export default DashboardShell;
