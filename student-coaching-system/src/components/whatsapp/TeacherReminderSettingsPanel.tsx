import { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type Settings = {
  is_active: boolean;
  channel: 'gateway' | 'meta';
  gateway_user_id: string;
  sender_phone: string;
  minutes_before: number;
  window_minutes: number;
};

type SessionRow = { id: string; name: string; role: string | null; phone: string | null };
type Resolved = { sessionId: string; source: 'manual' | 'super_admin' | 'env' | 'none'; name: string; phone: string };

const SOURCE_LABEL: Record<Resolved['source'], string> = {
  manual: 'panelden seçildi',
  super_admin: 'süper adminin bağlı hattı',
  env: 'sunucu ayarı',
  none: 'bağlı hat yok'
};

/**
 * Öğretmen ders hatırlatması — hangi WhatsApp hattından, kaç dakika önce.
 * Gönderim hattı, QR'ı okutan kullanıcının gateway oturumudur.
 */
export default function TeacherReminderSettingsPanel() {
  const [form, setForm] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [windowLabel, setWindowLabel] = useState('');
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/teacher-reminder-settings');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Ayarlar alınamadı');
      setForm(j.settings);
      setSessions(Array.isArray(j.connected_sessions) ? j.connected_sessions : []);
      setWindowLabel(j.window?.label || '');
      setResolved(j.resolved_session || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ayarlar alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (p: Partial<Settings>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/teacher-reminder-settings', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Kaydedilemedi');
      setForm(j.settings);
      setWindowLabel(j.window?.label || '');
      toast.success('Öğretmen hatırlatma ayarları kaydedildi');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Öğretmen hatırlatma ayarları yükleniyor…
      </div>
    );
  }
  if (!form) return null;

  const input =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none';
  const selectedConnected = sessions.some((s) => String(s.id) === String(form.gateway_user_id));

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-slate-900">Öğretmen ders hatırlatması</h3>
      </div>
      <p className="text-xs text-slate-500">
        Grup ve birebir derslerden önce öğretmene WhatsApp hatırlatması gider. Şu an{' '}
        <b>{windowLabel || `${form.minutes_before} dk kala`}</b> gönderiliyor.
      </p>

      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => patch({ is_active: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          <b>Otomasyon açık</b> — kapatılırsa hiç mesaj gitmez.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          Gönderim kanalı
          <select
            value={form.channel}
            onChange={(e) => patch({ channel: e.target.value as Settings['channel'] })}
            className={input}
          >
            <option value="gateway">Kurum WhatsApp hattı (gateway)</option>
            <option value="meta">Meta WhatsApp API</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Ders başlamadan kaç dakika önce
          <input
            type="number"
            min={1}
            max={120}
            value={form.minutes_before}
            onChange={(e) => patch({ minutes_before: Number(e.target.value) || 10 })}
            className={input}
          />
        </label>
      </div>

      {form.channel === 'gateway' ? (
        <>
          <label className="block text-xs font-medium text-slate-600">
            Gönderen hat — QR ile bağlı hesap
            <select
              value={form.gateway_user_id || ''}
              onChange={(e) => patch({ gateway_user_id: e.target.value })}
              className={input}
            >
              <option value="">Otomatik — süper adminin bağlı hattı</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.phone ? ` · ${s.phone}` : ''}
                </option>
              ))}
              {form.gateway_user_id && !selectedConnected ? (
                <option value={form.gateway_user_id}>
                  Seçili oturum (şu an bağlı değil)
                </option>
              ) : null}
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">
              Boş bırakırsanız süper admin hangi WhatsApp hattıyla bağlıysa mesajlar oradan gider.
              {sessions.length ? '' : ' Şu an bağlı oturum görünmüyor.'}
            </span>
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Gönderen numara (kayıt için)
            <input
              value={form.sender_phone || ''}
              onChange={(e) => patch({ sender_phone: e.target.value })}
              placeholder="05061877494"
              className={input}
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Mesajlar bu numaradan çıkmalı. Seçtiğiniz oturumun QR&apos;ını bu hat okutmuş olmalı.
            </span>
          </label>
        </>
      ) : null}

      {form.channel === 'gateway' ? (
        resolved && resolved.sessionId ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
            Mesajlar şu hattan gidecek: <b>{resolved.name || resolved.sessionId}</b>
            {resolved.phone ? ` · ${resolved.phone}` : ''} ({SOURCE_LABEL[resolved.source]}).
          </p>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Bağlı WhatsApp hattı yok — süper admin hesabından QR ile bağlanın. Hat bulunana kadar
            hatırlatma gönderilmez; yanlış numaradan mesaj çıkmasın diye otomasyon rastgele bir
            hatta geçmez.
          </p>
        )
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Kaydet
      </button>
    </section>
  );
}
