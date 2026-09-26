import { useEffect, useState } from 'react';
import { GraduationCap, Loader2, Pencil, Send } from 'lucide-react';
import { toast } from 'sonner';
import { crmSendTeacherTemplate, crmTeacherFlowTemplate } from '../../lib/crmInboxApi';

/**
 * Öğretmen başvurusu şeridi.
 * Gelen mesaj başvuru gibi göründüğünde konuşmada çıkar. Temsilci şablonu
 * olduğu gibi ya da düzenleyerek gönderir; otomatik gönderim ayrı bir ayardır
 * (Ayarlar > Otomatik Karşılama > Öğretmen Başvuru Otomasyonu).
 */
export default function CrmTeacherApplicationBar({
  conversationId,
  onSent
}: {
  conversationId: string;
  isAdmin?: boolean;
  onSent?: () => void;
}) {
  const [text, setText] = useState('');
  const [hasUrl, setHasUrl] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void crmTeacherFlowTemplate()
      .then((r) => {
        if (cancelled) return;
        setText(r.data.text || '');
        setHasUrl(Boolean(r.data.has_url));
      })
      .catch(() => {
        /* şablon okunamazsa düğme uyarır */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = async (custom?: string) => {
    setBusy(true);
    try {
      await crmSendTeacherTemplate(conversationId, custom);
      toast.success('Öğretmen başvuru şablonu gönderildi');
      setEditing(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablon gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-900">
          <GraduationCap className="h-4 w-4" />
          Öğretmen başvurusu görünüyor
        </span>
        <button
          type="button"
          disabled={busy || !text}
          onClick={() => void send()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          title="Öğretmen Başvuru Formu şablonunu gönder"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Gönder
        </button>
        <button
          type="button"
          disabled={busy || !text}
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
        >
          <Pencil className="h-3.5 w-3.5" />
          Düzenleyip gönder
        </button>
      </div>

      {!hasUrl ? (
        <p className="mt-1 text-[11px] font-medium text-rose-700">
          Öğretmen başvuru linki tanımlı değil — CRM → Widgetler → Otomatik Karşılama bölümünden ekleyin.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-violet-800">
          Şablon "Öğretmen Başvuru Formu" metnidir; başvuru linki otomatik yerleşir.
        </p>
      )}

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-violet-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void send(text)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Düzenlenmiş hâlini gönder
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
