import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page';

export const metadata: Metadata = { title: 'Öğrenci detayı' };

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Öğrenci detayı"
        description="Profil, program ve iletişim özeti"
        actions={
          <Link
            href="/students"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Listeye dön
          </Link>
        }
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm text-slate-500">Öğrenci ID</p>
        <p className="mt-1 font-mono text-sm">{studentId}</p>
        <p className="mt-4 text-sm text-slate-500">
          Detay görünümü sonraki fazda tamamlanacak.
        </p>
      </div>
    </div>
  );
}
