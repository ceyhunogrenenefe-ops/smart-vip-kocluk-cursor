import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { adVideosApi, type AdVideoSubmission } from './api';
import { fmtDateTime } from './format';
import PanelVideo from './PanelVideo';

type Item = { submission_id: string; title: string; teacher_name: string; version: number; review_status: string };

/** Reklam Videoları > İncelemedeki Montajlar. Ham dosya ve taslak burada yoktur. */
export default function ReviewMontaj({ focusId }: { focusId?: string | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(focusId || null);
  const [detail, setDetail] = useState<(AdVideoSubmission & { title: string; teacher_name: string }) | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adVideosApi
      .reviews()
      .then((r) => setItems(r.items))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusId) setOpenId(focusId);
  }, [focusId]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    adVideosApi
      .reviewGet(openId)
      .then((r) => setDetail(r.item))
      .catch((e) => {
        toast.error(e.message);
        setDetail(null);
      });
  }, [openId]);

  const send = async () => {
    if (!openId || !text.trim()) return;
    setBusy(true);
    try {
      await adVideosApi.comment(openId, text.trim());
      setText('');
      const r = await adVideosApi.reviewGet(openId);
      setDetail(r.item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yorum kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <ul className="space-y-2">
        {items.length ? (
          items.map((it) => (
            <li key={it.submission_id}>
              <button
                type="button"
                onClick={() => setOpenId(it.submission_id)}
                className={`w-full rounded-2xl border p-3 text-left ${openId === it.submission_id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}
              >
                <p className="font-semibold text-slate-900">{it.title}</p>
                <p className="text-xs text-slate-500">
                  {it.teacher_name} · montaj v{it.version}
                </p>
              </button>
            </li>
          ))
        ) : (
          <li className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">İncelemede montaj yok.</li>
        )}
      </ul>
      {detail ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{detail.title}</h2>
            <p className="text-xs text-slate-500">
              {detail.teacher_name} · montaj sürüm {detail.version}
              {detail.review_status === 'approved' ? ' · Onaylandı' : ''}
            </p>
          </div>
          {detail.playable ? (
            <PanelVideo
              submissionId={detail.id}
              title={detail.title}
              fileName={detail.file_name}
              sizeBytes={detail.size_bytes}
              previewStatus={detail.preview_status}
              previewNote={detail.preview_note}
            />
          ) : (
            <p className="text-sm text-slate-500">Bu sürüm panelde oynatılamıyor.</p>
          )}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MessageSquare className="h-4 w-4" /> Yorumlar
            </h3>
            <ul className="space-y-2">
              {(detail.comments || []).map((c) => (
                <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-600">
                    {c.author_name} · {fmtDateTime(c.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                </li>
              ))}
              {!detail.comments?.length ? <li className="text-sm text-slate-500">Henüz yorum yok.</li> : null}
            </ul>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Yorumunuz"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => void send()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Gönder
              </button>
            </div>
          </div>
        </section>
      ) : (
        <p className="text-sm text-slate-500">Bir montaj seçin.</p>
      )}
    </div>
  );
}
