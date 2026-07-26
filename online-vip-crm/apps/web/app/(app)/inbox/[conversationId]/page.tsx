import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { InboxLayout } from '@/components/inbox/inbox-layout';

export const metadata: Metadata = {
  title: 'Konuşma',
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return (
    <InboxLayout
      selectedId={conversationId}
      detail={
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <Link
              href="/inbox"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Konuşma detayı
              </p>
              <p className="font-mono text-[11px] text-slate-400">
                {conversationId}
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                Mesaj alanı (iskelet)
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Mesaj geçmişi ve gerçek zamanlı güncelleme sonraki fazda
                bağlanacak.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <input
                disabled
                placeholder="Mesaj yazın… (yakında)"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400"
              />
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-secondary px-3 py-2.5 text-sm font-semibold text-white opacity-50"
              >
                <Send className="h-4 w-4" />
                Gönder
              </button>
            </div>
          </div>
        </div>
      }
    />
  );
}
