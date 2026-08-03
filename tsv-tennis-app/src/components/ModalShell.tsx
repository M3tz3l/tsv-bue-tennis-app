import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ComponentProps, ReactNode } from 'react';

type ModalShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  footerActions?: {
    destructive?: ReactNode;
    secondary?: ReactNode;
    primary?: ReactNode;
  };
  disableClose?: boolean;
  widthClassName?: string;
  panelClassName?: string;
  backdropClassName?: string;
  backdropTestId?: string;
  panelProps?: Omit<ComponentProps<typeof DialogPanel>, 'className' | 'children'>;
  headerContent?: ReactNode;
  headerClassName?: string;
  footerClassName?: string;
};

const ModalShell = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  footerActions,
  disableClose = false,
  widthClassName = 'max-w-lg',
  panelClassName = '',
  backdropClassName = 'bg-black/30 backdrop-blur-sm',
  backdropTestId,
  panelProps,
  headerContent,
  headerClassName = '',
  footerClassName = '',
}: ModalShellProps) => {
  const close = () => {
    if (!disableClose) onClose();
  };

  return (
    <Dialog open={isOpen} onClose={close} className="relative z-50">
      <div
        data-testid={backdropTestId}
        data-modal-shell-backdrop="true"
        className={`fixed inset-0 ${backdropClassName}`}
        aria-hidden="true"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          {...panelProps}
          className={`w-full ${widthClassName} rounded-lg bg-white shadow-xl ${panelClassName}`}
        >
          <div className={`flex items-center justify-between border-b border-gray-200 px-6 py-4 ${headerClassName}`}>
            {headerContent ?? <DialogTitle className="text-lg font-medium text-gray-900">{title}</DialogTitle>}
            <button
              type="button"
              aria-label="Schließen"
              onClick={close}
              disabled={disableClose}
              className="touch-control"
            >
              <XMarkIcon className="h-6 w-6 text-gray-400" />
            </button>
          </div>
          {children}
          {(footer || footerActions) && <div className={`flex flex-wrap justify-end gap-3 border-t border-gray-100 px-6 py-4 ${footerClassName}`}>
            {footerActions ? (
              <div role="group" aria-label="Modal-Aktionen" className="contents">
                {footerActions.destructive && <div className="mr-auto">{footerActions.destructive}</div>}
                {footerActions.secondary}
                {footerActions.primary}
              </div>
            ) : footer}
          </div>}
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default ModalShell;
