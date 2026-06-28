import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export const APP_MODAL_Z = 200;

type AppModalProps = {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  align?: 'center' | 'bottom';
};

export function AppModal({
  open,
  onClose,
  children,
  className,
  panelClassName,
  align = 'center'
}: AppModalProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex p-4',
        align === 'bottom' ? 'items-end justify-center sm:items-center' : 'items-center justify-center',
        className
      )}
      style={{ zIndex: APP_MODAL_Z }}
      role="dialog"
      aria-modal="true"
    >
      {onClose ? (
        <button
          type="button"
          tabIndex={-1}
          className="absolute inset-0 cursor-default bg-black/50"
          aria-label="Kapat"
          onClick={onClose}
        />
      ) : (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" aria-hidden />
      )}
      <div
        className={cn(
          'relative z-[1] w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900',
          align === 'center' && 'max-w-lg',
          panelClassName
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
