import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

/** Profilim → Hesabımı sil (uygulama içi silme talebi) */
export default function AccountDeletionCard() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/account-deletion', {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Talep gönderilemedi');
      setSent(true);
      setOpen(false);
      toast.success(data?.already_pending ? 'Açık bir silme talebiniz zaten var.' : 'Hesap silme talebiniz alındı.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Talep gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm dark:border-rose-900/50 dark:bg-slate-900 sm:p-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Hesabımı sil</h2>
      <p className="mt-1 text-xs text-slate-500">
        Hesabınızın ve ilişkili verilerinizin (raporlar, planlar, mesajlar) silinmesini talep edebilirsiniz. Talep en geç
        30 gün içinde tamamlanır; yasal olarak saklanması gereken ödeme kayıtları mevzuattaki süre boyunca tutulur.
      </p>
      {sent ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          Talebiniz alındı. Kurumumuz sizinle iletişime geçecek.
        </p>
      ) : open ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Silme nedeni (isteğe bağlı)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Evet, hesabımın silinmesini istiyorum
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Hesabımı sil
        </button>
      )}
    </div>
  );
}
