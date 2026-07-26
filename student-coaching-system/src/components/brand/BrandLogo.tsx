import { BRAND_ALT, DEFAULT_BRAND_LOGO, DEFAULT_BRAND_MARK } from '../../lib/brandAssets';
import { cn } from '../../lib/utils';

type BrandLogoProps = {
  /** full = ders & koçluk lockup; mark = kare online vip amblem */
  variant?: 'full' | 'mark';
  className?: string;
  imgClassName?: string;
  alt?: string;
};

/**
 * Marka logosu — her yerde aynı amblem/lockup.
 * full: login, marketing, auth kartları
 * mark: sidebar, favicon tarzı küçük kare
 */
export default function BrandLogo({
  variant = 'full',
  className,
  imgClassName,
  alt = BRAND_ALT
}: BrandLogoProps) {
  const src = variant === 'mark' ? DEFAULT_BRAND_MARK : DEFAULT_BRAND_LOGO;
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center overflow-hidden bg-white',
        variant === 'mark' ? 'rounded-xl' : 'rounded-2xl',
        className
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          'block object-contain',
          variant === 'mark' ? 'h-full w-full p-0.5' : 'h-auto max-h-full w-full max-w-full p-1.5',
          imgClassName
        )}
        decoding="async"
      />
    </div>
  );
}
