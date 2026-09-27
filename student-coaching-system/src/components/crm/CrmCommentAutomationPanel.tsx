import { useCallback, useEffect, useState } from 'react';
import { Instagram, Loader2, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type Automation = {
  id?: string;
  name: string;
  media_id: string | null;
  media_caption: string | null;
  media_permalink: string | null;
  media_thumbnail_url: string | null;
  keywords: string[];
  match_whole_word: boolean;
  dm_text: string;
  reply_comment_text: string | null;
  once_per_user: boolean;
  is_active: boolean;
  sent_count?: number;
  last_sent_at?: string | null;
};

type Media = {
  id: string;
  caption?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
};

const BOS: Automation = {
  name: '',
  media_id: null,
  media_caption: null,
  media_permalink: null,
  media_thumbnail_url: null,
  keywords: [],
  match_whole_word: true,
  dm_text: '',
  reply_comment_text: null,
  once_per_user: true,
  is_active: false
};

const input =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none';

function kisaBaslik(m: Media): string {
  const c = String(m.caption || '').replace(/\s+/g, ' ').trim();
  const tarih = m.timestamp ? new Date(m.timestamp).toLocaleDateString('tr-TR') : '';
  const metin = c ? (c.length > 60 ? `${c.slice(0, 60)}…` : c) : 'Başlıksız gönderi';
  return tarih ? `${tarih} · ${metin}` : metin;
}

/**
 * Instagram yorum otomasyonu — gönderi seç, anahtar kelime yaz,
 * yorum yazana PDF linkini otomatik DM olarak gönder.
 */
export default function CrmCommentAutomationPanel() {
  const [items, setItems] = useState<Automation[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [mediaHint, setMediaHint] = useState<string | null>(null);
  const [draft, setDraft] = useState<Automation | null>(null);
  const [keywordText, setKeywordText] = useState('');
  const [testText, setTestText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/crm-comment-automations');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Liste alınamadı');
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMedia = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crm-comment-automations?op=media');
      const j = await res.json().catch(() => ({}));
      setMedia(Array.isArray(j.items) ? j.items : []);
      setMediaHint(j.ok === false ? j.hint || j.error || null : null);
    } catch {
      setMedia([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const yeni = () => {
    setDraft({ ...BOS });
    setKeywordText('');
    setTestText('');
    void loadMedia();
  };

  const duzenle = (a: Automation) => {
    setDraft({ ...a });
    setKeywordText((a.keywords || []).join(', '));
    setTestText('');
    void loadMedia();
  };

  const kaydet = async () => {
    if (!draft) return;
    const keywords = keywordText
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!keywords.length) {
      toast.error('En az bir anahtar kelime girin');
      return;
    }
    if (!draft.dm_text.trim()) {
      toast.error('Gönderilecek mesajı yazın');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/api/crm-comment-automations', {
        method: 'POST',
        body: JSON.stringify({ ...draft, keywords })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Kaydedilemedi');
      toast.success('Otomasyon kaydedildi');
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const sil = async (a: Automation) => {
    if (!a.id) return;
    if (!window.confirm(`«${a.name}» otomasyonu silinsin mi?`)) return;
    try {
      const res = await apiFetch(`/api/crm-comment-automations?id=${encodeURIComponent(a.id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Silinemedi');
      toast.success('Silindi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const denemeYap = async () => {
    if (!draft || !testText.trim()) return;
    const keywords = keywordText
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const res = await apiFetch('/api/crm-comment-automations?op=test', {
      method: 'POST',
      body: JSON.stringify({ text: testText, keywords, match_whole_word: draft.match_whole_word })
    });
    const j = await res.json().catch(() => ({}));
    if (j.matched) toast.success(`Eşleşti: «${j.keyword}» — bu yoruma mesaj giderdi`);
    else toast.warning('Eşleşmedi — bu yoruma mesaj gitmezdi');
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Instagram className="h-4 w-4 text-pink-600" />
          <h3 className="text-sm font-semibold text-slate-900">Instagram yorum otomasyonu</h3>
        </div>
        {!draft ? (
          <button
            type="button"
            onClick={yeni}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Yeni otomasyon
          </button>
        ) : null}
      </div>
      <p className="text-xs text-slate-500">
        Seçtiğiniz gönderiye anahtar kelimeyi yazan kişiye otomatik özel mesaj gider — örneğin PDF
        linkiniz. Büyük/küçük harf farkı yoktur: <b>LGS</b>, <b>lgs</b>, <b>Lgs</b> ve{' '}
        <b>lgs&apos;ye</b> aynı sayılır.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Yükleniyor…
        </p>
      ) : null}

      {!draft && !loading ? (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {a.name}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        a.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {a.is_active ? 'Açık' : 'Kapalı'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {a.media_id ? `Gönderi: ${a.media_caption || a.media_id}` : 'Tüm gönderiler'} ·{' '}
                    {(a.keywords || []).join(', ')} · {a.sent_count || 0} gönderim
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => duzenle(a)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => void sil(a)}
                    className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                    title="Sil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!items.length ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              Henüz otomasyon yok. &quot;Yeni otomasyon&quot; ile başlayın.
            </p>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <label className="block text-xs font-medium text-slate-600">
            Otomasyon adı
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="LGS PDF gönderimi"
              className={input}
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Hangi gönderi
            <select
              value={draft.media_id || ''}
              onChange={(e) => {
                const m = media.find((x) => x.id === e.target.value);
                setDraft({
                  ...draft,
                  media_id: e.target.value || null,
                  media_caption: m ? kisaBaslik(m) : null,
                  media_permalink: m?.permalink || null,
                  media_thumbnail_url: m?.thumbnail_url || m?.media_url || null
                });
              }}
              className={input}
            >
              <option value="">Tüm gönderiler</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {kisaBaslik(m)}
                </option>
              ))}
              {draft.media_id && !media.some((m) => m.id === draft.media_id) ? (
                <option value={draft.media_id}>{draft.media_caption || draft.media_id}</option>
              ) : null}
            </select>
            {mediaHint ? <span className="mt-1 block text-[11px] text-amber-700">{mediaHint}</span> : null}
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Anahtar kelimeler (virgülle ayırın)
            <input
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder="LGS, lgs kampı, deneme"
              className={input}
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Büyük/küçük harf ve noktalama önemsiz. Tek tek LGS/lgs/Lgs yazmanıza gerek yok.
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={draft.match_whole_word}
              onChange={(e) => setDraft({ ...draft, match_whole_word: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <b>Tam kelime ara</b> — kapalıysa kelimenin içinde geçmesi de yeter (ör. &quot;xlgsx&quot;).
            </span>
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Gönderilecek özel mesaj (PDF linkinizi buraya koyun)
            <textarea
              rows={4}
              value={draft.dm_text}
              onChange={(e) => setDraft({ ...draft, dm_text: e.target.value })}
              placeholder={'Merhaba {{username}} 👋\nLGS deneme kampı rehberimiz: https://…/rehber.pdf'}
              className={input}
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              {'{{username}}'} kullanıcı adıyla, {'{{keyword}}'} yazdığı kelimeyle değişir.
            </span>
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Yorumun altına açık yanıt (isteğe bağlı)
            <input
              value={draft.reply_comment_text || ''}
              onChange={(e) => setDraft({ ...draft, reply_comment_text: e.target.value })}
              placeholder="DM'den gönderdik 💌"
              className={input}
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={draft.once_per_user}
              onChange={(e) => setDraft({ ...draft, once_per_user: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <b>Aynı kişiye bir kez</b> — aynı kullanıcı tekrar yorum yazarsa mesaj tekrar gitmez.
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <b>Otomasyon açık</b> — kapalıyken hiç mesaj gitmez.
            </span>
          </label>

          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <p className="text-[11px] font-medium text-slate-600">Deneme — bir yorum yazın, eşleşir mi bakalım</p>
            <div className="mt-1 flex gap-2">
              <input
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="lgs pdf alabilir miyim?"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => void denemeYap()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Dene
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void kaydet()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Kaydet
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
      ) : null}
    </section>
  );
}
