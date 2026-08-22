import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/page';

export const metadata: Metadata = { title: 'Öğrenciler' };

export default function StudentsPage() {
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Öğrenciler"
        description="Kayıtlı öğrenci profilleri ve koçluk ilişkileri"
      />
      <EmptyState
        title="Öğrenci listesi yakında"
        description="Öğrenci API’si bağlandığında buraya liste gelecek."
      />
      <p className="mt-4 text-xs text-slate-400">
        Örnek detay:{' '}
        <Link href="/students/demo" className="text-brand-secondary underline">
          /students/demo
        </Link>
      </p>
    </div>
  );
}
