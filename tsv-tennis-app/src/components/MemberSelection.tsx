import { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useAuth } from '../context/AuthContext';
import type { UserResponse } from '@/types';

interface MemberSelectionProps {
    users: UserResponse[];
    selectionToken: string;
    onComplete: () => void;
    onCancel: () => void;
}

export const MemberSelection = ({ users, selectionToken, onComplete, onCancel }: MemberSelectionProps) => {
    const { selectMember } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');

    const handleSelectMember = async (memberId: string) => {
        setLoading(true);
        setError('');

        try {
            const result = await selectMember(memberId, selectionToken);
            if (result.success) {
                onComplete();
            } else {
                setError(result.message || 'Mitgliederauswahl fehlgeschlagen');
            }
        } catch {
            setError('Ein unerwarteter Fehler ist aufgetreten');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={true} onClose={() => { if (!loading) onCancel(); }} className="relative z-50">
            <div className="fixed inset-0 bg-[var(--canvas)]" aria-hidden="true" />
            <div className="fixed inset-0 flex items-center justify-center p-4">
                <DialogPanel className="bg-white p-8 border border-[var(--hairline)] max-w-md w-full mx-4">
                    <DialogTitle className="text-2xl font-bold text-center mb-6 text-[var(--ink)]">
                        Mitglied auswählen
                    </DialogTitle>

                    <p className="text-[var(--muted)] mb-6 text-center">
                        Mehrere Mitglieder mit dieser E-Mail-Adresse gefunden. Klicken Sie auf das gewünschte Mitglied:
                    </p>

                    <div className="space-y-3 mb-6">
                        {[...users]
                            .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                            .map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => handleSelectMember(user.id)}
                                    disabled={loading}
                                    className="w-full flex items-center p-4 border border-[var(--hairline-strong)] cursor-pointer hover:bg-[var(--canvas-soft)] hover:border-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-left"
                                >
                                    <div className="flex-1">
                                        <div className="font-semibold text-[var(--ink)]">
                                            {user.name}
                                        </div>
                                        {user.email && (
                                            <div className="text-sm text-[var(--muted)]">
                                                {user.email}
                                            </div>
                                        )}
                                    </div>
                                    <div className="ml-3 text-[var(--primary)]">
                                        {loading ? (
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--primary)]"></div>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            ))}
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-[var(--error)]/5 border border-[var(--error)]/30 text-[var(--error)]">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-center">
                        <button
                            onClick={onCancel}
                            disabled={loading}
                            className="px-6 py-2 border border-[var(--hairline-strong)] text-[var(--body)] hover:bg-[var(--canvas-soft)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Abbrechen
                        </button>
                    </div>
                </DialogPanel>
            </div>
        </Dialog>
    );
};
