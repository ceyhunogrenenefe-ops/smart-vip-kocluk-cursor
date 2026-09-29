'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/super-admin/institutions', label: 'Kurumlar' },
  { href: '/super-admin/plans', label: 'Planlar' },
  { href: '/super-admin/system-health', label: 'Sistem sağlığı' },
  { href: '/super-admin/integration-errors', label: 'Entegrasyon hataları' },
] as const;

export function SuperAdminNav() {
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
                ? 'bg-slate-900 text-white'
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
