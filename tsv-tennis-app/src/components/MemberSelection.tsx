import { useState } from 'react';
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
        } catch (err) {
            setError('Ein unerwarteter Fehler ist aufgetreten');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full mx-4 backdrop-blur-sm border border-white/20 ring-1 ring-black/5">
                <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
                    Mitglied auswählen
                </h2>

                <p className="text-gray-600 mb-6 text-center">
                    Mehrere Mitglieder mit dieser E-Mail-Adresse gefunden. Klicken Sie auf das gewünschte Mitglied:
                </p>

                <div className="space-y-3 mb-6">
                    {users
                        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                        .map((user) => (
                            <button
                                key={user.id}
                                onClick={() => handleSelectMember(user.id)}
                                disabled={loading}
                                className="w-full flex items-center p-4 border rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-left"
                            >
                                <div className="flex-1">
                                    <div className="font-semibold text-gray-800">
                                        {user.name}
                                    </div>
                                    {user.email && (
                                        <div className="text-sm text-gray-500">
                                            {user.email}
                                        </div>
                                    )}
                                </div>
                                <div className="ml-3 text-blue-600">
                                    {loading ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
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
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}

                <div className="flex justify-center">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Abbrechen
                    </button>
                </div>
            </div>
        </div>
    );
};