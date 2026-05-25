import React from 'react';
import { cn } from '../../lib/utils';

type IconTapButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Varsayılan 44×44; `sm` = 36×36 kompakt araç çubukları */
  size?: 'md' | 'sm';
};

/** Ok / ikon düğmeleri — ilk dokunuşta tetiklenir, SVG tıklamayı yutmasın */
export function IconTapButton({
  className,
  size = 'md',
  children,
  type = 'button',
  ...props
}: IconTapButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 touch-manipulation select-none items-center justify-center rounded-lg transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-11 w-11 min-h-[44px] min-w-[44px]' : 'h-9 w-9 min-h-[36px] min-w-[36px]',
        className
      )}
      {...props}
    >
      <span className="pointer-events-none flex items-center justify-center [&>svg]:pointer-events-none">
        {children}
      </span>
    </button>
  );
}
