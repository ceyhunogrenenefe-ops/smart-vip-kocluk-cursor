import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Plus, Save, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';

type Button = {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
};

type Template = {
  id: string;
  name: string;
  meta_template_name: string | null;
  language: string;
  category: string | null;
  status: string;
  status_label: string;
  header_type: string;
  header_text: string | null;
  header_media_url: string | null;
  header_media_handle: string | null;
  body: string;
  footer_text: string | null;
  buttons: Button[];
  variable_map: Record<string, string>;
  body_examples: Record<string, string>;
  meta_template_id: string | null;
  rejected_reason: string | null;
  updated_at: string | null;
  source: string;
};

type Meta = {
  statuses: Record<string, string>;
  limits: Record<string, number>;
  header_types: string[];
  media_rules: Record<string, { label: string }>;
  variable_fields: Array<{ id: string; label: string }>;
  categories: Array<{ id: string; label: string; hint: string }>;
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-emerald-100 text-emerald-900',
  REJECTED: 'bg-rose-100 text-rose-900',
  PAUSED: 'bg-orange-100 text-orange-900',
  DISABLED: 'bg-slate-200 text-slate-600'
};

const HEADER_LABEL: Record<string, string> = {
  NONE: 'Başlık yok',
  TEXT: 'Metin',
  IMAGE: 'Görüntü',
  VIDEO: 'Video',
  DOCUMENT: 'Belge/Dosya'
};

const bos = (): Partial<Template> => ({
  name: '',
  language: 'tr',
  category: 'UTILITY',
  header_type: 'NONE',
  header_text: '',
  body: '',
  footer_text: '',
  buttons: [],
  variable_map: {},
  body_examples: {}
});

/** Gövdedeki {{n}} numaralarını sırayla döndürür. */
function variableNumbers(body: string): string[] {
  const set = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) set.add(m[1]);
  return [...set].sort((a, b) => Number(a) - Number(b));
}

/** Önizlemede {{n}} yerine örnek değer koyar. */
function preview(body: string, examples: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => examples[n] || `örnek${n}`);
}

/** WhatsApp Metin formatı → basit HTML (yalnız önizleme için). */
function formatted(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*(.+?)\*/g, '<b>$1</b>')
    .replace(/_(.+?)_/g, '<i>$1</i>')
    .replace(/~(.+?)~/g, '<s>$1</s>')
    .replace(/\n/g, '<br/>');
}

export default function WhatsAppTemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<Template> | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/whatsapp-templates');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || 'Liste alınamadı');
      setItems(j.items || []);
      setMeta(j.meta || null);
      setMetaError(j.meta_error || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: string, v: unknown) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const uploadMedia = async (file: File) => {
    if (!draft) return;
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('Dosya okunamadı'));
        fr.readAsDataURL(file);
      });
      const res = await apiFetch('/api/whatsapp-templates?op=upload-media', {
        method: 'POST',
        body: JSON.stringify({ header_type: draft.header_type, file_data: dataUrl })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || 'Yüklenemedi');
      setDraft((d) =>
        d ? { ...d, header_media_handle: j.handle, header_media_url: URL.createObjectURL(file) } : d
      );
      toast.success('Örnek medya Meta’ya yüklendi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const save = async (submit: boolean) => {
    if (!draft) return;
    setBusy(true);
    try {
      const op = submit ? 'submit' : 'save-draft';
      // blob: adresi yalnız bu sekmede geçerli — sunucuya gönderilmez
      const payload = { ...draft };
      if (String(payload.header_media_url || '').startsWith('blob:')) payload.header_media_url = null;
      const res = await apiFetch(`/api/whatsapp-templates?op=${op}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || 'İşlem başarısız');
      toast.success(j.message || (submit ? 'Meta’ya gönderildi' : 'Taslak kaydedildi'));
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız', { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const sil = async (t: Template) => {
    if (!window.confirm(`«${t.name}» taslağı silinsin mi?`)) return;
    const res = await apiFetch(`/api/whatsapp-templates?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message || 'Silinemedi');
      return;
    }
    toast.success('Silindi');
    await load();
  };

  const varNums = useMemo(() => variableNumbers(String(draft?.body || '')), [draft?.body]);
  const input = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
  const limits = meta?.limits || { bodyMax: 1024, footerMax: 60, headerTextMax: 60 };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">WhatsApp</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">Şablon Yöneticisi</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Başlık, gövde, alt bilgi ve butonlarıyla şablon hazırlayın; taslak olarak saklayın veya Meta’ya
            inceleme için gönderin. Listede WABA hesabınızdaki tüm şablonlar görünür.
          </p>
        </div>
        {!draft ? (
          <button
            type="button"
            onClick={() => setDraft(bos())}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Yeni şablon
          </button>
        ) : null}
      </div>

      {metaError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Meta’daki şablonlar çekilemedi ({metaError}). Aşağıda yalnız CRM kayıtları görünüyor.
        </p>
      ) : null}

      {draft ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Kategori</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(meta?.categories || []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set('category', c.id)}
                    className={`rounded-xl border px-3 py-2 text-left ${
                      draft.category === c.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                    <p className="text-[11px] text-slate-500">{c.hint}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Şablon adı ve dili</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <label className="block text-xs font-medium text-slate-600">
                  Şablonunuza bir ad verin
                  <input
                    value={String(draft.name || '')}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="ders_programi_bilgilendirme"
                    className={input}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Meta küçük harf ve alt çizgiye çevirir.
                  </span>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Dili seçin
                  <select value={String(draft.language || 'tr')} onChange={(e) => set('language', e.target.value)} className={input}>
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                    <option value="en_US">English (US)</option>
                    <option value="ar">العربية</option>
                    <option value="de">Deutsch</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Başlık · isteğe bağlı</h3>
              <div className="flex flex-wrap gap-2">
                {(meta?.header_types || ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => set('header_type', h)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      draft.header_type === h ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    {HEADER_LABEL[h] || h}
                  </button>
                ))}
              </div>
              {draft.header_type === 'TEXT' ? (
                <label className="block text-xs font-medium text-slate-600">
                  Başlık metni
                  <input
                    maxLength={limits.headerTextMax}
                    value={String(draft.header_text || '')}
                    onChange={(e) => set('header_text', e.target.value)}
                    className={input}
                  />
                  <span className="mt-0.5 block text-right text-[11px] text-slate-400">
                    {String(draft.header_text || '').length}/{limits.headerTextMax}
                  </span>
                </label>
              ) : null}
              {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(draft.header_type)) ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Örnek dosya — Meta inceleme için ister
                    <input
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadMedia(f);
                      }}
                      className="mt-1 block w-full text-xs"
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {meta?.media_rules?.[String(draft.header_type)]?.label}
                  </p>
                  {uploading ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Meta’ya yükleniyor…
                    </p>
                  ) : draft.header_media_handle ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-700">✓ Örnek medya yüklendi</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-amber-700">
                      Dosya yüklenmeden şablon gönderilemez.
                    </p>
                  )}
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Gövde</h3>
              <textarea
                rows={6}
                maxLength={limits.bodyMax}
                value={String(draft.body || '')}
                onChange={(e) => set('body', e.target.value)}
                placeholder={'Merhaba {{1}},\n{{2}} öğrencimizin ders programı hazırlandı.'}
                className={input}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex gap-1">
                  {[
                    ['*kalın*', 'B'],
                    ['_italik_', 'I'],
                    ['~üstü çizili~', 'S']
                  ].map(([snippet, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => set('body', `${String(draft.body || '')}${snippet}`)}
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => set('body', `${String(draft.body || '')}{{${varNums.length + 1}}}`)}
                    className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800"
                  >
                    + Değişken ekle
                  </button>
                </span>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {String(draft.body || '').length}/{limits.bodyMax}
                </span>
              </div>

              {varNums.length ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold text-slate-600">
                    Değişkenler — CRM alanı ve Meta’ya gidecek örnek değer
                  </p>
                  <div className="mt-2 space-y-2">
                    {varNums.map((n) => (
                      <div key={n} className="grid gap-2 sm:grid-cols-[60px_1fr_1fr]">
                        <span className="pt-2 font-mono text-xs text-slate-600">{`{{${n}}}`}</span>
                        <select
                          value={draft.variable_map?.[n] || ''}
                          onChange={(e) => set('variable_map', { ...(draft.variable_map || {}), [n]: e.target.value })}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        >
                          <option value="">CRM alanı seçin…</option>
                          {(meta?.variable_fields || []).map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>
                        <input
                          placeholder="Örnek değer (Meta için)"
                          value={draft.body_examples?.[n] || ''}
                          onChange={(e) => set('body_examples', { ...(draft.body_examples || {}), [n]: e.target.value })}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Alt bilgi · isteğe bağlı</h3>
              <input
                maxLength={limits.footerMax}
                value={String(draft.footer_text || '')}
                onChange={(e) => set('footer_text', e.target.value)}
                placeholder="Online VIP Dershane"
                className={input}
              />
              <span className="mt-0.5 block text-right text-[11px] text-slate-400">
                {String(draft.footer_text || '').length}/{limits.footerMax}
              </span>
            </section>

            <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Butonlar · isteğe bağlı</h3>
                <span className="text-[11px] text-slate-500">En çok 3 hızlı yanıt · 1 telefon · 2 bağlantı</span>
              </div>
              {(draft.buttons || []).map((b, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[150px_1fr_1fr_40px]">
                  <select
                    value={b.type}
                    onChange={(e) => {
                      const next = [...(draft.buttons || [])];
                      next[i] = { ...next[i], type: e.target.value as Button['type'] };
                      set('buttons', next);
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    <option value="QUICK_REPLY">Hızlı yanıt</option>
                    <option value="URL">Web sitesi</option>
                    <option value="PHONE_NUMBER">Telefon</option>
                  </select>
                  <input
                    placeholder="Buton yazısı"
                    maxLength={25}
                    value={b.text}
                    onChange={(e) => {
                      const next = [...(draft.buttons || [])];
                      next[i] = { ...next[i], text: e.target.value };
                      set('buttons', next);
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  {b.type === 'URL' ? (
                    <input
                      placeholder="https://…"
                      value={b.url || ''}
                      onChange={(e) => {
                        const next = [...(draft.buttons || [])];
                        next[i] = { ...next[i], url: e.target.value };
                        set('buttons', next);
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                  ) : b.type === 'PHONE_NUMBER' ? (
                    <input
                      placeholder="+905061877494"
                      value={b.phone_number || ''}
                      onChange={(e) => {
                        const next = [...(draft.buttons || [])];
                        next[i] = { ...next[i], phone_number: e.target.value };
                        set('buttons', next);
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => set('buttons', (draft.buttons || []).filter((_, j) => j !== i))}
                    className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set('buttons', [...(draft.buttons || []), { type: 'QUICK_REPLY', text: '' }])}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                + Buton ekle
              </button>
            </section>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Meta’ya İnceleme İçin Gönder
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Taslak Kaydet
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Vazgeç
              </button>
            </div>
          </div>

          {/* Canlı telefon önizlemesi */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-semibold text-slate-600">Önizleme</p>
            <div className="rounded-[28px] border-8 border-slate-800 bg-[#e5ddd5] p-3 shadow-lg">
              <div className="rounded-xl bg-white p-2 shadow-sm">
                {draft.header_media_url && ['IMAGE'].includes(String(draft.header_type)) ? (
                  <img src={draft.header_media_url} alt="" className="mb-2 max-h-36 w-full rounded-lg object-cover" />
                ) : ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(draft.header_type)) ? (
                  <div className="mb-2 flex h-24 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                    {String(draft.header_type) === 'DOCUMENT' ? <FileText className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
                  </div>
                ) : null}
                {draft.header_type === 'TEXT' && draft.header_text ? (
                  <p className="mb-1 text-sm font-bold text-slate-900">{draft.header_text}</p>
                ) : null}
                <p
                  className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
                  dangerouslySetInnerHTML={{
                    __html: formatted(preview(String(draft.body || 'Mesajınız burada görünecek'), draft.body_examples || {}))
                  }}
                />
                {draft.footer_text ? <p className="mt-1.5 text-[11px] text-slate-400">{draft.footer_text}</p> : null}
              </div>
              {(draft.buttons || []).filter((b) => b.text).length ? (
                <div className="mt-1 space-y-1">
                  {(draft.buttons || [])
                    .filter((b) => b.text)
                    .map((b, i) => (
                      <div key={i} className="rounded-lg bg-white py-2 text-center text-sm font-medium text-sky-600 shadow-sm">
                        {b.text}
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Şablon</th>
                <th className="px-3 py-2 font-medium">Kategori</th>
                <th className="px-3 py-2 font-medium">Dil</th>
                <th className="px-3 py-2 font-medium">Başlık</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 font-medium">Meta ID</th>
                <th className="px-3 py-2 font-medium">Son güncelleme</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{t.name}</span>
                    {t.meta_template_name ? (
                      <span className="block font-mono text-[10px] text-slate-400">{t.meta_template_name}</span>
                    ) : null}
                    {t.rejected_reason ? (
                      <span className="mt-0.5 block rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-800">
                        {t.rejected_reason}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.category || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{t.language}</td>
                  <td className="px-3 py-2 text-slate-600">{HEADER_LABEL[t.header_type] || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[t.status] || 'bg-slate-100'}`}>
                      {t.status_label || t.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-400">{t.meta_template_id || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {t.updated_at ? new Date(t.updated_at).toLocaleString('tr-TR') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.status === 'DRAFT' || t.status === 'REJECTED' ? (
                      <button
                        type="button"
                        onClick={() => setDraft({ ...t })}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Düzenle
                      </button>
                    ) : null}
                    {t.status === 'DRAFT' ? (
                      <button
                        type="button"
                        onClick={() => void sil(t)}
                        className="ml-1 rounded-lg border border-red-200 bg-red-50 p-1 text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                    Şablon yok. “Yeni şablon” ile başlayın.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
