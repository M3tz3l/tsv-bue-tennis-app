import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { buttonVariants } from '../styles/tokens';
import ModalShell from './ModalShell';

type Props = {
    isOpen: boolean;
    isProcessing?: boolean;
    onConfirm: () => Promise<void> | void;
    onCancel: () => void;
};

export default function DeleteConfirmDialog({
    isOpen,
    isProcessing = false,
    onConfirm,
    onCancel
}: Props) {
    return (
        <ModalShell isOpen={isOpen} onClose={onCancel} title="Eintrag löschen" disableClose={isProcessing} widthClassName="max-w-sm" footer={(
            <>
                <button type="button" onClick={onCancel} disabled={isProcessing} className={buttonVariants.secondary}>Abbrechen</button>
                <button type="button" onClick={async () => { await onConfirm(); }} disabled={isProcessing} className={buttonVariants.destructive}>{isProcessing ? 'Löschen...' : 'Löschen'}</button>
            </>
        )}>
                            <div className="p-4 sm:p-6">
                                <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0">
                                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="mt-2 text-sm text-gray-600">
                                            Möchten Sie diesen Eintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                                        </div>
                                    </div>
                                </div>

                            </div>
        </ModalShell>
    );
}
