import { Dialog, DialogPanel, TransitionChild, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

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
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={() => { if (!isProcessing) onCancel(); }}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/30" />
                </TransitionChild>

                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <TransitionChild
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0 translate-y-2 scale-95"
                        enterTo="opacity-100 translate-y-0 scale-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100 translate-y-0 scale-100"
                        leaveTo="opacity-0 translate-y-2 scale-95"
                    >
                        <DialogPanel className="max-w-sm w-full bg-white rounded-lg shadow-xl overflow-hidden">
                            <div className="p-4 sm:p-6">
                                <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0">
                                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <Dialog.Title className="text-sm font-semibold text-gray-900">Eintrag löschen</Dialog.Title>
                                        <div className="mt-2 text-sm text-gray-600">
                                            Möchten Sie diesen Eintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 sm:mt-6 flex justify-end space-x-2">
                                    <button
                                        type="button"
                                        onClick={onCancel}
                                        disabled={isProcessing}
                                        className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => { await onConfirm(); }}
                                        disabled={isProcessing}
                                        className={`px-3 py-2 rounded-md text-sm font-medium text-white ${isProcessing ? 'bg-red-400' : 'bg-red-600 hover:bg-red-700'}`}
                                    >
                                        {isProcessing ? 'Löschen...' : 'Löschen'}
                                    </button>
                                </div>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </Dialog>
        </Transition>
    );
}
