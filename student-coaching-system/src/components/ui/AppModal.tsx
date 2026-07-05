import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export const APP_MODAL_Z = 220;

type AppModalProps = {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  /** Mobilde alttan sheet; sm+ ortalanmış */
  align?: 'center' | 'bottom';
};

export function AppModal({
  open,
  onClose,
  children,
  className,
  panelClassName,
  align = 'bottom'
}: AppModalProps) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex p-0 sm:p-4',
        align === 'bottom' ? 'items-end justify-center sm:items-center' : 'items-end justify-center sm:items-center',
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
          'relative z-[1] flex w-full max-h-[min(92dvh,900px)] flex-col overflow-hidden bg-white shadow-xl',
          'rounded-t-2xl sm:rounded-2xl dark:bg-slate-900',
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

export function AppModalHeader({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between border-b border-gray-100 p-4 sm:p-6 dark:border-slate-800',
        className
      )}
    >
      {children}
    </div>
  );
}

export function AppModalBody({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 [-webkit-overflow-scrolling:touch]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function AppModalFooter({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'shrink-0 border-t border-gray-100 bg-white p-4 pb-safe sm:p-6 dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      {children}
    </div>
  );
}

export function AppModalForm({
  children,
  className,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form {...props} className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {children}
    </form>
  );
}
