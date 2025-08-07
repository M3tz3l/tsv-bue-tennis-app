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
    const [selectedMemberId, setSelectedMemberId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');

    const handleSelectMember = async () => {
        if (!selectedMemberId) {
            setError('Bitte wählen Sie ein Mitglied aus.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const result = await selectMember(selectedMemberId, selectionToken);
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
                    Mehrere Mitglieder mit dieser E-Mail-Adresse gefunden. Bitte wählen Sie das gewünschte Mitglied aus:
                </p>

                <div className="space-y-3 mb-6">
                    {users
                        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                        .map((user) => (
                            <label
                                key={user.id}
                                className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                            >
                                <input
                                    type="radio"
                                    name="member"
                                    value={user.id}
                                    checked={selectedMemberId === user.id}
                                    onChange={(e) => setSelectedMemberId(e.target.value)}
                                    className="mr-3 text-blue-600"
                                />
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
                            </label>
                        ))}
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}

                <div className="flex space-x-3">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={handleSelectMember}
                        disabled={loading || !selectedMemberId}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? 'Wird geladen...' : 'Auswählen'}
                    </button>
                </div>
            </div>
        </div>
    );
};