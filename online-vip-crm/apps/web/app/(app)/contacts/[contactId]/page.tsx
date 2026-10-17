import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page';

export const metadata: Metadata = {
  title: 'Kişi detayı',
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Kişi detayı"
        description="Profil, etkileşimler ve ilişkili kayıtlar"
        actions={
          <Link
            href="/contacts"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Listeye dön
          </Link>
        }
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm text-slate-500">Kişi ID</p>
        <p className="mt-1 font-mono text-sm text-slate-800">{contactId}</p>
        <p className="mt-4 text-sm text-slate-500">
          Detay görünümü ve düzenleme formu sonraki fazda tamamlanacak.
        </p>
      </div>
    </div>
  );
}
