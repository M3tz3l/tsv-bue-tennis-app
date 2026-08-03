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
        <ModalShell isOpen={isOpen} onClose={onCancel} title="Eintrag löschen" disableClose={isProcessing} widthClassName="max-w-sm" footer={null} footerActions={{
            destructive: <button type="button" onClick={async () => { await onConfirm(); }} disabled={isProcessing} className={buttonVariants.destructive}>{isProcessing ? 'Löschen...' : 'Löschen'}</button>,
            secondary: <button type="button" onClick={onCancel} disabled={isProcessing} className={buttonVariants.secondary}>Abbrechen</button>,
        }}>
                            <div className="px-6 py-5">
                                <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0">
                                        <ExclamationTriangleIcon className="h-6 w-6 text-[var(--error)]" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="mt-2 text-sm text-[var(--muted)]">
                                            Möchten Sie diesen Eintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                                        </div>
                                    </div>
                                </div>

                            </div>
        </ModalShell>
    );
}
