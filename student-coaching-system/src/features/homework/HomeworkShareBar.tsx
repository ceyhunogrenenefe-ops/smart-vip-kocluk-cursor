import { useState } from 'react';
import { Copy, Link2, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createHomeworkShare, homeworkShareUrl } from './homeworkApi';

/**
 * Ödev paylaşım çubuğu: bağlantı üret, kopyala, WhatsApp'a gönder.
 * Bağlantı yalnız ödevin kendisini gösterir; öğrenci listesi veya iletişim bilgisi içermez.
 */
export default function HomeworkShareBar({
  homeworkId,
  homeworkTitle,
  dueDate,
  existingToken
}: {
  homeworkId: string;
  homeworkTitle?: string | null;
  dueDate?: string | null;
  existingToken?: string | null;
}) {
  const [token, setToken] = useState<string>(existingToken || '');
  const [busy, setBusy] = useState(false);

  const url = token ? homeworkShareUrl(token) : '';

  const ensureLink = async (): Promise<string> => {
    if (url) return url;
    setBusy(true);
    try {
      const r = await createHomeworkShare(homeworkId);
      setToken(r.data.share_token);
      return homeworkShareUrl(r.data.share_token);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      const link = await ensureLink();
      await navigator.clipboard.writeText(link);
      toast.success('Bağlantı kopyalandı — gruba yapıştırabilirsiniz');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlantı oluşturulamadı');
    }
  };

  const shareWhatsApp = async () => {
    try {
      const link = await ensureLink();
      const parts = [
        homeworkTitle ? `Ödev: ${homeworkTitle}` : 'Ödev',
        dueDate ? `Teslim: ${new Date(dueDate).toLocaleDateString('tr-TR')}` : '',
        link
      ].filter(Boolean);
      window.open(`https://wa.me/?text=${encodeURIComponent(parts.join('\n'))}`, '_blank', 'noopener');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlantı oluşturulamadı');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void copy()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : url ? <Copy className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {url ? 'Bağlantıyı kopyala' : 'Bağlantı oluştur'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void shareWhatsApp()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp ile gönder
      </button>
      {url ? <code className="truncate rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{url}</code> : null}
    </div>
  );
}
