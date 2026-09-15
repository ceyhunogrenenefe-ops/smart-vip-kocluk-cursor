'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { contactDisplayName, cn, formatRelativeTr } from '@/lib/utils';
import { InboxLayout } from '@/components/inbox/inbox-layout';

export function ConversationView({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const conversationQuery = useQuery({
    queryKey: ['inbox', 'conversation', conversationId],
    queryFn: () => api.conversation(conversationId),
  });

  const messagesQuery = useQuery({
    queryKey: ['inbox', 'messages', conversationId],
    queryFn: () => api.messages(conversationId, { take: 100 }),
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => api.reply(conversationId, body),
    onSuccess: async () => {
      setText('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inbox', 'messages', conversationId] }),
        qc.invalidateQueries({ queryKey: ['inbox', 'conversations'] }),
        qc.invalidateQueries({ queryKey: ['inbox', 'conversation', conversationId] }),
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data?.items?.length]);

  const contactName = contactDisplayName(conversationQuery.data?.contact ?? null);
  const provider = conversationQuery.data?.provider ?? '—';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || replyMutation.isPending) return;
    replyMutation.mutate(trimmed);
  }

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
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {conversationQuery.isLoading ? 'Yükleniyor…' : contactName}
              </p>
              <p className="text-[11px] text-slate-400">
                {provider} · {formatRelativeTr(conversationQuery.data?.lastMessageAt)}
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#fff_40%)] p-4">
            {messagesQuery.isLoading && (
              <p className="text-center text-sm text-slate-400">Mesajlar yükleniyor…</p>
            )}
            {messagesQuery.error && (
              <p className="text-center text-sm text-brand-primary">
                Mesajlar yüklenemedi.
              </p>
            )}
            {(messagesQuery.data?.items ?? []).map((m) => {
              const outbound = m.direction === 'OUTBOUND';
              return (
                <div
                  key={m.id}
                  className={cn('flex', outbound ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                      outbound
                        ? 'rounded-br-md bg-brand-secondary text-white'
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {m.textContent || '—'}
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        outbound ? 'text-white/70' : 'text-slate-400',
                      )}
                    >
                      {formatRelativeTr(m.createdAt)} · {m.status}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={onSubmit}
            className="sticky bottom-0 border-t border-slate-200 bg-white p-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={1}
                placeholder="Mesaj yazın…"
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-secondary/40 focus:ring-2 focus:ring-brand-secondary/15"
              />
              <button
                type="submit"
                disabled={!text.trim() || replyMutation.isPending}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-secondary px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Gönder
              </button>
            </div>
            {replyMutation.isError && (
              <p className="mt-2 text-xs text-brand-primary">
                Gönderilemedi. Yetkinizi veya bağlantıyı kontrol edin.
              </p>
            )}
          </form>
        </div>
      }
    />
  );
}
