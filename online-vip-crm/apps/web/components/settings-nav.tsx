'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/settings/profile', label: 'Profil' },
  { href: '/settings/users', label: 'Kullanıcılar' },
  { href: '/settings/channels', label: 'Kanallar' },
  { href: '/settings/templates', label: 'Şablonlar' },
  { href: '/settings/pipelines', label: 'Pipeline' },
  { href: '/settings/tags', label: 'Etiketler' },
  { href: '/settings/roles', label: 'Roller' },
  { href: '/settings/security', label: 'Güvenlik' },
  { href: '/settings/audit-logs', label: 'Denetim' },
  { href: '/settings/institutions', label: 'Kurum' },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-soft">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition',
              active
                ? 'bg-brand-secondary text-white'
                : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
