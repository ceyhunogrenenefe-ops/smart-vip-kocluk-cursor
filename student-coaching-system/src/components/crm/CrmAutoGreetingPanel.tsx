import { useEffect, useState } from 'react';
import { BotMessageSquare, Clock, GraduationCap, Loader2, ScrollText, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmAutoGreetingLogs,
  crmGetAutoGreetingSettings,
  crmSaveAutoGreetingSettings,
  type CrmAutoGreetingLog,
  type CrmAutoGreetingSettings
} from '../../lib/crmInboxApi';

const input =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none';

const EVENT_LABELS: Record<string, string> = {
  greeting_sent: 'Otomatik karşılama gönderildi',
  teacher_intent_detected: 'Öğretmen başvuru niyeti tespit edildi',
  teacher_message_sent: 'Öğretmen başvuru mesajı gönderildi',
  teacher_tag_added: 'Öğretmen Başvurusu etiketi eklendi',
  teacher_repeat_blocked: 'Tekrar gönderim engellendi',
  teacher_template_manual: 'Temsilci şablonu elle gönderdi',
  teacher_intent_unclear: 'Niyet belirsiz — otomasyon çalıştırılmadı',
  grade_detected: 'Sınıf tespit edildi',
  task_created: 'Satış görevi oluşturuldu',
  flow_completed: 'Akış tamamlandı',
  human_takeover: 'Temsilci devraldı',
  flow_resumed: 'Otomatik akış yeniden başlatıldı',
  prefers_message: 'Müşteri mesajla bilgi istedi',
  error: 'Hata'
};

function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-slate-300 text-emerald-600"
      />
      <span>
        {label}
        {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * Ayarlar > Otomatik Karşılama.
 * Modül varsayılan kapalıdır; buradan açılana kadar hiçbir otomatik mesaj gitmez.
 */
export default function CrmAutoGreetingPanel() {
  const [form, setForm] = useState<CrmAutoGreetingSettings | null>(null);
  const [slotsText, setSlotsText] = useState('');
  const [logs, setLogs] = useState<CrmAutoGreetingLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void crmGetAutoGreetingSettings()
      .then((r) => {
        if (cancelled) return;
        const base: CrmAutoGreetingSettings = r.data || {
          institution_id: r.institution_id,
          is_active: false,
          teacher_flow_active: false,
          teacher_channel_whatsapp: true,
          teacher_channel_instagram: true,
          teacher_channel_facebook: true,
          teacher_message: null,
          teacher_application_url: null,
          channel_whatsapp: true,
          channel_instagram: true,
          channel_facebook: true,
          run_mode: 'after_hours',
          business_start: '09:00',
          business_end: '22:00',
          custom_start: null,
          custom_end: null,
          greeting_text: null,
          call_time_text: null,
          closing_text: null,
          call_slots: r.defaults.call_slots
        };
        setForm(base);
        setSlotsText((base.call_slots || r.defaults.call_slots).join('\n'));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Ayarlar alınamadı'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (p: Partial<CrmAutoGreetingSettings>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const call_slots = slotsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await crmSaveAutoGreetingSettings({ ...form, call_slots });
      setForm(r.data);
      setSlotsText((r.data.call_slots || []).join('\n'));
      toast.success(r.data.is_active ? 'Kaydedildi — modül açık' : 'Kaydedildi — modül kapalı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const loadLogs = async () => {
    setShowLogs(true);
    try {
      const r = await crmAutoGreetingLogs(50);
      setLogs(r.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıtlar alınamadı');
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </section>
    );
  }
  if (!form) return null;

  return (
    <section className="space-y-4 rounded-2xl border-2 border-sky-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Ayarlar</p>
        <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <BotMessageSquare className="h-5 w-5 text-sky-700" />
          Otomatik Karşılama
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Temsilci çevrim içi değilken gelen yeni adayı karşılar, öğrencinin sınıfını ve uygun arama
          saatini sorar, lead kaydına işler ve satış ekibine görev açar.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">Otomasyonlar</p>
        <Toggle
          checked={form.is_active}
          onChange={(v) => patch({ is_active: v })}
          label="Öğrenci / Veli Otomatik Karşılama"
          hint={
            form.is_active
              ? 'Açık — yeni adaya sınıf ve arama saati sorulur.'
              : 'Kapalı — öğrenci/veli akışında mesaj gönderilmez.'
          }
        />
        <Toggle
          checked={form.teacher_flow_active}
          onChange={(v) => patch({ teacher_flow_active: v })}
          label="Öğretmen Başvuru Otomasyonu"
          hint={
            form.teacher_flow_active
              ? 'Açık — net öğretmen başvurusuna başvuru linki gönderilir.'
              : 'Kapalı — öğretmen başvurusu yalnız etiketlenir, mesaj gitmez.'
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">Kanallar</p>
          <Toggle checked={form.channel_whatsapp} onChange={(v) => patch({ channel_whatsapp: v })} label="WhatsApp" />
          <Toggle checked={form.channel_instagram} onChange={(v) => patch({ channel_instagram: v })} label="Instagram" />
          <Toggle checked={form.channel_facebook} onChange={(v) => patch({ channel_facebook: v })} label="Facebook" />
          <p className="text-[11px] text-slate-500">
            TikTok mesajlaşma bağlantısı sistemde yok; eklendiğinde buraya gelir.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Clock className="h-4 w-4 text-sky-700" />
            Çalışma zamanı
          </p>
          {(
            [
              ['always', 'Her zaman aktif'],
              ['after_hours', 'Sadece mesai saatleri dışında'],
              ['custom_window', 'Özel saat aralığında']
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name="run_mode"
                checked={form.run_mode === value}
                onChange={() => patch({ run_mode: value })}
                className="text-emerald-600"
              />
              {label}
            </label>
          ))}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="block text-xs font-medium text-slate-600">
              Mesai başlangıcı
              <input
                type="time"
                value={String(form.business_start || '').slice(0, 5)}
                onChange={(e) => patch({ business_start: e.target.value })}
                className={input}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Mesai bitişi
              <input
                type="time"
                value={String(form.business_end || '').slice(0, 5)}
                onChange={(e) => patch({ business_end: e.target.value })}
                className={input}
              />
            </label>
          </div>

          {form.run_mode === 'custom_window' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-slate-600">
                Özel başlangıç
                <input
                  type="time"
                  value={String(form.custom_start || '').slice(0, 5)}
                  onChange={(e) => patch({ custom_start: e.target.value })}
                  className={input}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Özel bitiş
                <input
                  type="time"
                  value={String(form.custom_end || '').slice(0, 5)}
                  onChange={(e) => patch({ custom_end: e.target.value })}
                  className={input}
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <GraduationCap className="h-4 w-4 text-violet-700" />
          Öğretmen Başvuru Otomasyonu
        </p>
        <p className="text-[11px] text-slate-600">
          Öğrenci/veli akışından bağımsızdır. Açık olduğunda net bir öğretmen başvurusuna başvuru
          linki bir kez gönderilir; öğretmene sınıf sorusu asla sorulmaz.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle
            checked={form.teacher_channel_whatsapp}
            onChange={(v) => patch({ teacher_channel_whatsapp: v })}
            label="WhatsApp"
          />
          <Toggle
            checked={form.teacher_channel_instagram}
            onChange={(v) => patch({ teacher_channel_instagram: v })}
            label="Instagram"
          />
          <Toggle
            checked={form.teacher_channel_facebook}
            onChange={(v) => patch({ teacher_channel_facebook: v })}
            label="Facebook"
          />
        </div>
        <label className="block text-xs font-medium text-slate-600">
          Öğretmen Başvuru Linki
          <input
            type="url"
            value={form.teacher_application_url ?? ''}
            onChange={(e) => patch({ teacher_application_url: e.target.value })}
            placeholder="https://…/ogretmen-basvuru"
            className={input}
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Link boşken otomasyon mesaj göndermez.
          </span>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Öğretmen mesajı — {'[ÖĞRETMEN_BASVURU_LINKI]'} yukarıdaki adresle değişir
          <textarea
            rows={7}
            value={form.teacher_message ?? ''}
            onChange={(e) => patch({ teacher_message: e.target.value })}
            placeholder="Boş bırakılırsa varsayılan metin kullanılır"
            className={input}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">Öğrenci / veli mesajları</p>
        <label className="block text-xs font-medium text-slate-600">
          Karşılama mesajı (sınıf seçenekleri altına eklenir)
          <textarea
            rows={4}
            value={form.greeting_text ?? ''}
            onChange={(e) => patch({ greeting_text: e.target.value })}
            placeholder="Boş bırakılırsa varsayılan metin kullanılır"
            className={input}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Arama saati sorusu — {'{program}'} seçilen sınıfla değişir
          <textarea
            rows={3}
            value={form.call_time_text ?? ''}
            onChange={(e) => patch({ call_time_text: e.target.value })}
            placeholder="Boş bırakılırsa varsayılan metin kullanılır"
            className={input}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kapanış mesajı
          <textarea
            rows={3}
            value={form.closing_text ?? ''}
            onChange={(e) => patch({ closing_text: e.target.value })}
            placeholder="Boş bırakılırsa varsayılan metin kullanılır"
            className={input}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Arama saat aralıkları (her satıra bir aralık)
          <textarea
            rows={5}
            value={slotsText}
            onChange={(e) => setSlotsText(e.target.value)}
            className={input}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </button>
        <button
          type="button"
          onClick={() => void loadLogs()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ScrollText className="h-4 w-4" />
          İşlem kayıtları
        </button>
      </div>

      {showLogs ? (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
          {!logs.length ? (
            <p className="text-xs text-slate-500">Henüz kayıt yok.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {logs.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1">
                  <span className="text-slate-800">{EVENT_LABELS[l.event] || l.event}</span>
                  <span className="shrink-0 text-slate-400">
                    {new Date(l.created_at).toLocaleString('tr-TR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
