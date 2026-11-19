import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  ChevronDown,
  Globe,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  Send,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  aiConsultants,
  aiGetSettings,
  aiKbPages,
  aiKbRefresh,
  aiLogs,
  aiSaveSettings,
  aiSlotsPreview,
  aiTestChat,
  aiToneDelete,
  aiToneRebuild,
  aiToneSources,
  aiToneUpload,
  type AiAssistantSettings,
  type AiChatTurn,
  type AiConsultant,
  type AiKbPage,
  type AiLog,
  type AiSchedule,
  type AiSlot,
  type AiToneSource
} from '../../lib/crmAiAssistantApi';

const input =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-600 focus:outline-none';
const btn =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const EVENT_LABELS: Record<string, string> = {
  session_started: 'Yeni konuşma devralındı',
  replied: 'Yanıt gönderildi',
  appointment_booked: 'Randevu oluşturuldu',
  handover: 'İnsana devredildi',
  resumed: 'Bot yeniden başlatıldı',
  skipped: 'Atlandı',
  error: 'Hata',
  config_error: 'Ayar hatası',
  kb_refreshed: 'Bilgi tabanı yenilendi',
  tone_uploaded: 'Sohbet örneği yüklendi',
  settings_saved: 'Ayarlar kaydedildi'
};

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5 (en yetenekli)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (daha hızlı / ekonomik)'
};
const EFFORT_LABELS: Record<string, string> = { low: 'Düşük (hızlı)', medium: 'Orta (önerilen)', high: 'Yüksek' };

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-violet-600" />
      <span>
        {label}
        {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function ScheduleEditor({ value, onChange }: { value: AiSchedule; onChange: (v: AiSchedule) => void }) {
  const setDay = (day: number, ranges: { start: string; end: string }[]) => onChange({ ...value, [day]: ranges });
  return (
    <div className="space-y-2">
      {DAYS.map((name, i) => {
        const day = i + 1;
        const ranges = value[day] || value[String(day)] || [];
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
            <span className="w-24 text-sm font-medium text-slate-800">{name}</span>
            {ranges.length === 0 ? <span className="text-xs text-slate-400">Kapalı (ekip yanıtlar)</span> : null}
            {ranges.map((r, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs">
                <input
                  type="time"
                  value={r.start}
                  onChange={(e) => setDay(day, ranges.map((x, j) => (j === idx ? { ...x, start: e.target.value } : x)))}
                  className="rounded border border-slate-200 px-1 py-0.5"
                />
                –
                <input
                  type="time"
                  value={r.end === '24:00' ? '23:59' : r.end}
                  onChange={(e) =>
                    setDay(day, ranges.map((x, j) => (j === idx ? { ...x, end: e.target.value === '23:59' ? '24:00' : e.target.value } : x)))
                  }
                  className="rounded border border-slate-200 px-1 py-0.5"
                />
                <button type="button" aria-label="Aralığı sil" onClick={() => setDay(day, ranges.filter((_, j) => j !== idx))}>
                  <X className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </span>
            ))}
            <button type="button" className="text-xs font-semibold text-violet-700" onClick={() => setDay(day, [...ranges, { start: '19:00', end: '24:00' }])}>
              <Plus className="inline h-3.5 w-3.5" /> aralık
            </button>
            <button type="button" className="text-xs text-slate-500" onClick={() => setDay(day, [{ start: '00:00', end: '24:00' }])}>
              tüm gün
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-500">
        Bitişi başlangıçtan önce olan aralık ertesi sabaha taşar (ör. 19:00–09:00). Saatler İstanbul saatidir.
      </p>
    </div>
  );
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}

/**
 * Ayarlar > AI Satış Asistanı.
 * Varsayılan kapalı; yönetici açana kadar tek mesaj gönderilmez.
 */
export default function CrmAiAssistantPanel() {
  const [acik, setAcik] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<AiAssistantSettings | null>(null);
  const [claudeOk, setClaudeOk] = useState(true);
  const [kvkkNotice, setKvkkNotice] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [siteText, setSiteText] = useState('');
  const [pages, setPages] = useState<AiKbPage[]>([]);
  const [tones, setTones] = useState<AiToneSource[]>([]);
  const [bizAuthor, setBizAuthor] = useState('');
  const [consultants, setConsultants] = useState<AiConsultant[]>([]);
  const [slots, setSlots] = useState<AiSlot[] | null>(null);
  const [logs, setLogs] = useState<AiLog[] | null>(null);
  const [chat, setChat] = useState<AiChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [lastTools, setLastTools] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await aiGetSettings();
      setForm(r.data);
      setClaudeOk(r.claude_configured);
      setKvkkNotice(r.defaults.kvkk_notice);
      setModels(r.defaults.models);
      setSiteText((r.data.site_urls || []).join('\n'));
      const [p, t, c] = await Promise.all([aiKbPages(), aiToneSources(), aiConsultants()]);
      setPages(p.data);
      setTones(t.data);
      setConsultants(c.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI asistan ayarları okunamadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (acik && !form) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  const patch = (p: Partial<AiAssistantSettings>) => setForm((f) => (f ? { ...f, ...p } : f));

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      if (!form) return;
      const r = await aiSaveSettings({
        ...form,
        site_urls: siteText.split(/\s+/).map((s) => s.trim()).filter(Boolean)
      });
      setForm(r.data);
      setSiteText((r.data.site_urls || []).join('\n'));
      toast.success(r.data.is_active ? 'Kaydedildi — AI asistan AÇIK' : 'Kaydedildi (asistan kapalı)');
    });

  const okPages = useMemo(() => pages.filter((p) => p.status === 'ok'), [pages]);
  const activeWarnings = useMemo(() => {
    const w: string[] = [];
    if (!claudeOk) w.push('ANTHROPIC_API_KEY Vercel ortamında tanımlı değil — asistan yanıt üretemez.');
    if (form?.table_missing) w.push('Veritabanı tabloları yok: sql/2026-11-19-crm-ai-sales-assistant.sql çalıştırılmalı.');
    if (!okPages.length) w.push('Bilgi tabanı boş — önce “Siteyi şimdi çek”e basın; boşken asistan her soruyu danışmana devreder.');
    return w;
  }, [claudeOk, form?.table_missing, okPages.length]);

  const sendTest = () =>
    run('chat', async () => {
      const text = chatInput.trim();
      if (!text) return;
      const turns: AiChatTurn[] = [...chat, { role: 'user', text }];
      setChat(turns);
      setChatInput('');
      const r = await aiTestChat(turns);
      setChat([...turns, { role: 'assistant', text: r.data.reply }]);
      setLastTools(r.data.tools.map((t) => t.tool));
    });

  return (
    <section
      data-test="ai-satis-asistani"
      className={
        acik
          ? 'space-y-5 rounded-2xl border-2 border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-4 shadow-sm sm:p-5'
          : 'rounded-2xl border-2 border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-4 py-3 shadow-sm'
      }
    >
      <button type="button" onClick={() => setAcik((v) => !v)} aria-expanded={acik} className="flex w-full items-center gap-2 text-left">
        <Bot className="h-5 w-5 shrink-0 text-violet-700" />
        <span className="text-lg font-semibold text-slate-900">AI Satış Asistanı</span>
        {form ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${form.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
            {form.is_active ? 'Açık' : 'Kapalı'}
          </span>
        ) : null}
        <ChevronDown className={`ml-auto h-5 w-5 shrink-0 text-violet-700 transition-transform ${acik ? '' : '-rotate-90'}`} aria-hidden />
      </button>

      {!acik ? null : loading || !form ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <>
          <p className="max-w-3xl text-sm text-slate-600">
            Seçtiğiniz saatlerde Instagram DM ve WhatsApp mesajlarını Claude ile yanıtlar. Yalnız sitedeki bilgiyle konuşur,
            emin olmadığında danışmana devreder; ad, sınıf, hedef, telefon ve (18 yaş altı için) veli bilgilerini toplar,
            danışmanların vardiyasındaki boş saatlerden randevu açar ve arama ekibine bildirim gönderir. Temsilci sohbete
            yazdığı anda bot o sohbette susar.
          </p>

          {activeWarnings.length ? (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {activeWarnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          ) : null}

          {/* 1. Durum ve kanallar */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <Toggle checked={form.is_active} onChange={(v) => patch({ is_active: v })} label="Asistanı aç" hint="Kapalıyken hiçbir otomatik yanıt gitmez." />
              <Toggle checked={form.channel_whatsapp} onChange={(v) => patch({ channel_whatsapp: v })} label="WhatsApp (0506 187 74 94)" />
              <Toggle checked={form.channel_instagram} onChange={(v) => patch({ channel_instagram: v })} label="Instagram DM" />
              <Toggle
                checked={form.primary_ig_only}
                onChange={(v) => patch({ primary_ig_only: v })}
                label="Yalnız ana Instagram hesabı (@onlinevipdershane)"
                hint="Ek bağlı hesaplara (ör. @onlinevipdersvekocluk) gelen DM'lere bot yazmaz."
              />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <label className="block text-xs font-semibold text-slate-600">
                Model
                <select className={input} value={form.model} onChange={(e) => patch({ model: e.target.value })}>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {MODEL_LABELS[m] || m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Düşünme seviyesi
                <select className={input} value={form.effort} onChange={(e) => patch({ effort: e.target.value })}>
                  {Object.entries(EFFORT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                KVKK aydınlatma metni bağlantısı
                <input className={input} value={form.kvkk_url || ''} onChange={(e) => patch({ kvkk_url: e.target.value })} placeholder="https://…" />
              </label>
              <p className="rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
                <b>İlk mesaj (sabit):</b> {kvkkNotice}
              </p>
            </div>
          </div>

          {/* 2. Çalışma saatleri */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <CalendarClock className="h-4 w-4 text-violet-700" /> Çalışma saatleri
            </h3>
            <ScheduleEditor value={form.schedule} onChange={(schedule) => patch({ schedule })} />
          </div>

          {/* 3. Bilgi tabanı */}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Globe className="h-4 w-4 text-violet-700" /> Bilgi tabanı (onlinevipdershane.com)
            </h3>
            <label className="block text-xs font-semibold text-slate-600">
              Çekilecek sayfalar (her satıra bir adres; yalnız onlinevipdershane.com)
              <textarea className={`${input} h-28 font-mono text-[11px]`} value={siteText} onChange={(e) => setSiteText(e.target.value)} />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btn}
                disabled={busy !== null}
                onClick={() =>
                  run('kb', async () => {
                    await aiSaveSettings({ site_urls: siteText.split(/\s+/).filter(Boolean) });
                    const r = await aiKbRefresh();
                    toast.success(`${r.data.ok} sayfa güncellendi${r.data.failed ? `, ${r.data.failed} sayfa alınamadı` : ''}`);
                    setPages((await aiKbPages()).data);
                  })
                }
              >
                {busy === 'kb' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Siteyi şimdi çek
              </button>
              <span className="text-xs text-slate-500">
                {okPages.length} sayfa · {Math.round(okPages.reduce((a, p) => a + p.chars, 0) / 1000)} bin karakter
                {okPages[0] ? ` · son: ${new Date(okPages[0].fetched_at).toLocaleString('tr-TR')}` : ''}
              </span>
            </div>
            {pages.length ? (
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-[11px]">
                {pages.map((p) => (
                  <li key={p.id} className={p.status === 'ok' ? 'text-slate-600' : 'text-red-700'}>
                    {p.status === 'ok' ? '✓' : '✗'} {p.title || p.url} <span className="text-slate-400">{p.url}</span>
                    {p.error ? ` — ${p.error}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* 4. Ton: geçmiş sohbetler */}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <MessageSquareText className="h-4 w-4 text-violet-700" /> Üslup — geçmiş sohbetler
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              WhatsApp “Sohbeti dışa aktar” (.txt, medyasız) veya Instagram “Bilgilerini indir” içindeki message_1.json
              dosyalarını yükleyin. Telefon, e-posta ve müşteri adları maskelenir; yalnız anonim örnek olarak saklanır.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Bizim taraftaki ad (boşsa otomatik)
                <input className={input} value={bizAuthor} onChange={(e) => setBizAuthor(e.target.value)} placeholder="Online VIP Dershane" />
              </label>
              <label className={`${btn} cursor-pointer`}>
                {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Sohbet yükle
                <input
                  type="file"
                  accept=".txt,.json"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    void run('upload', async () => {
                      for (const f of files) {
                        const r = await aiToneUpload(f.name, await readFileText(f), bizAuthor);
                        toast.success(`${f.name}: ${r.data.message_count} mesaj (bizim taraf: ${r.data.business_author || '?'})`);
                      }
                      setTones((await aiToneSources()).data);
                    });
                  }}
                />
              </label>
              <button
                type="button"
                className={btn}
                disabled={busy !== null || !tones.length}
                onClick={() =>
                  run('tone', async () => {
                    const r = await aiToneRebuild();
                    patch({ tone_guide: r.data.tone_guide });
                    toast.success('Ton rehberi üretildi — kontrol edip kaydedin');
                  })
                }
              >
                {busy === 'tone' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScrollText className="h-3.5 w-3.5" />} Ton rehberini üret
              </button>
            </div>
            {tones.length ? (
              <ul className="mt-2 space-y-1 text-xs">
                {tones.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span className="truncate">
                      {t.file_name} · {t.source_kind} · {t.message_count} mesaj
                    </span>
                    <button
                      type="button"
                      aria-label="Sil"
                      onClick={() =>
                        run('del', async () => {
                          await aiToneDelete(t.id);
                          setTones((x) => x.filter((y) => y.id !== t.id));
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="mt-2 block text-xs font-semibold text-slate-600">
              Ton rehberi (düzenlenebilir)
              <textarea className={`${input} h-32`} value={form.tone_guide || ''} onChange={(e) => patch({ tone_guide: e.target.value })} />
            </label>
            <label className="mt-2 block text-xs font-semibold text-slate-600">
              Ek talimatlar (ör. “Yaz kampı kayıtları kapandı, sorulursa danışmana yönlendir”)
              <textarea className={`${input} h-20`} value={form.extra_instructions || ''} onChange={(e) => patch({ extra_instructions: e.target.value })} />
            </label>
          </div>

          {/* 5. Randevu */}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <CalendarClock className="h-4 w-4 text-violet-700" /> Arama ekibi ve randevu
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              Boş saatler CRM vardiyalarından hesaplanır; o saatte açık arama görevi olan danışman dolu sayılır. Hiçbiri
              seçilmezse vardiyası olan herkes arama ekibidir.
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {consultants.map((c) => (
                <Toggle
                  key={c.user_id}
                  checked={form.consultant_user_ids.includes(c.user_id)}
                  onChange={(v) =>
                    patch({
                      consultant_user_ids: v
                        ? [...form.consultant_user_ids, c.user_id]
                        : form.consultant_user_ids.filter((x) => x !== c.user_id)
                    })
                  }
                  label={c.name}
                  hint={c.shifts
                    .map((s) => `${DAYS[s.day_of_week - 1]?.slice(0, 3)} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
                    .join(' · ')}
                />
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">
                Görüşme süresi (dk)
                <input type="number" className={input} value={form.slot_minutes} onChange={(e) => patch({ slot_minutes: Number(e.target.value) })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Kaç gün ilerisi
                <input type="number" className={input} value={form.days_ahead} onChange={(e) => patch({ days_ahead: Number(e.target.value) })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                En erken (dk sonra)
                <input type="number" className={input} value={form.min_lead_minutes} onChange={(e) => patch({ min_lead_minutes: Number(e.target.value) })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Sohbet başına en çok yanıt
                <input type="number" className={input} value={form.max_bot_replies} onChange={(e) => patch({ max_bot_replies: Number(e.target.value) })} />
              </label>
            </div>
            <button type="button" className={`${btn} mt-2`} disabled={busy !== null} onClick={() => run('slots', async () => setSlots((await aiSlotsPreview()).data))}>
              Şu an önerilecek saatleri göster
            </button>
            {slots ? (
              <p className="mt-1 text-xs text-slate-600">{slots.length ? slots.map((s) => s.label).join(' · ') : 'Boş saat yok (vardiya tanımlı mı?)'}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet
            </button>
          </div>

          {/* 6. Deneme sohbeti */}
          <div className="rounded-xl border border-dashed border-violet-300 bg-white p-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Deneme sohbeti</h3>
            <p className="mb-2 text-xs text-slate-500">
              Kaydedilmiş ayarlarla çalışır; hiçbir mesaj gönderilmez, randevu oluşturulmaz.
            </p>
            <div className="max-h-72 space-y-2 overflow-auto rounded-lg bg-slate-50 p-2 text-sm">
              {chat.length === 0 ? <p className="text-xs text-slate-400">Örn. “Merhaba, oğlum 8. sınıf, LGS paketiniz ne kadar?”</p> : null}
              {chat.map((t, i) => (
                <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${t.role === 'user' ? 'ml-auto bg-emerald-100' : 'bg-white shadow-sm'}`}>
                  {t.text}
                </div>
              ))}
            </div>
            {lastTools.length ? <p className="mt-1 text-[11px] text-slate-500">Kullanılan araçlar: {lastTools.join(', ')}</p> : null}
            <div className="mt-2 flex gap-2">
              <input
                className={input}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendTest();
                }}
                placeholder="Veli gibi yazın…"
              />
              <button type="button" className={btn} disabled={busy !== null} onClick={() => void sendTest()}>
                {busy === 'chat' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
              <button type="button" className={btn} onClick={() => setChat([])}>
                Temizle
              </button>
            </div>
          </div>

          {/* 7. Kayıtlar */}
          <div>
            <button type="button" className={btn} onClick={() => void run('logs', async () => setLogs((await aiLogs()).data))}>
              <ScrollText className="h-3.5 w-3.5" /> İşlem kayıtları
            </button>
            {logs ? (
              <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs text-slate-700">
                {logs.length === 0 ? <li className="text-slate-400">Kayıt yok</li> : null}
                {logs.map((l) => (
                  <li key={l.id}>
                    <span className="text-slate-400">{new Date(l.created_at).toLocaleString('tr-TR')}</span> ·{' '}
                    <b>{EVENT_LABELS[l.event] || l.event}</b>
                    {l.detail && (l.detail.reason || l.detail.error) ? ` — ${String(l.detail.reason || l.detail.error)}` : ''}
                    {l.conversation_id ? (
                      <a className="ml-1 text-violet-700 underline" href={`/crm/inbox?c=${l.conversation_id}`}>
                        sohbet
                      </a>
                    ) : null}
                    {l.input_tokens ? <span className="text-slate-400"> · {l.input_tokens + (l.output_tokens || 0)} token</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
