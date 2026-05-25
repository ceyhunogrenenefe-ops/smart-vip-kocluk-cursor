import React from 'react';
import { CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

type TapCheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

/** 44px dokunma alanı — küçük checkbox tıklama sorunlarını önler */
export function TapCheckbox({
  checked,
  onToggle,
  disabled,
  className,
  'aria-label': ariaLabel = 'İşaretle'
}: TapCheckboxProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg touch-manipulation',
        'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded border',
          checked
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-gray-300 bg-white hover:border-green-400 dark:border-slate-600 dark:bg-slate-900'
        )}
      >
        {checked ? <CheckCircle className="h-4 w-4" /> : null}
      </span>
    </button>
  );
}
