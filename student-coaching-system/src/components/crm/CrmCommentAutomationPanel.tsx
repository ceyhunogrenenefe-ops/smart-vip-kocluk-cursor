import { useCallback, useEffect, useState } from 'react';
import { Facebook, Instagram, Loader2, Plus, Save, Trash2, Users, Wand2 } from 'lucide-react';
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
  /** PDF gondermeden once Instagram takip kontrolu yap */
  follow_gate_enabled?: boolean;
  follow_invite_text?: string | null;
  follow_button_text?: string | null;
  follow_retry_text?: string | null;
  follow_retry_button_text?: string | null;
  sent_count?: number;
  last_sent_at?: string | null;
  /** Otomasyonun çalışacağı Instagram hesabı; boş = ana hesap */
  ig_user_id?: string | null;
};

/** Ek Instagram hesabı (erişim anahtarı sunucudan maskeli gelir) */
type IgHesap = {
  id: string;
  ig_user_id: string;
  ig_username: string | null;
  page_id: string | null;
  token_masked: string;
  is_active: boolean;
  last_verified_at: string | null;
  last_verify_error: string | null;
};

type AnaHesap = { ig_user_id: string | null; username: string | null };

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
  is_active: false,
  follow_gate_enabled: false,
  follow_invite_text: null,
  follow_button_text: null,
  follow_retry_text: null,
  follow_retry_button_text: null,
  ig_user_id: null
};

/** Takip dogrulamasi bu kurulumda calisiyor mu */
type Yetenek = {
  baglanti_var?: boolean;
  token_calisiyor?: boolean;
  alan_destekleniyor?: boolean | null;
  ig_username?: string | null;
  neden?: string | null;
  oneri?: string | null;
};

const input =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none';

function hesapAdi(h: { ig_username?: string | null; ig_user_id?: string | null }): string {
  return h.ig_username ? `@${h.ig_username}` : String(h.ig_user_id || '');
}

/**
 * Ek Instagram hesapları — aynı kurumun başka IG hesaplarını bağlar.
 * Yorumlar aynı CRM gelen kutusuna düşer; otomasyonlar hesap bazında seçilir.
 */
function IgHesaplariBolumu({
  hesaplar,
  anaHesap,
  tabloYok,
  onDegisti
}: {
  hesaplar: IgHesap[];
  anaHesap: AnaHesap | null;
  tabloYok: boolean;
  onDegisti: () => Promise<void> | void;
}) {
  const [acik, setAcik] = useState(false);
  const [pageId, setPageId] = useState('');
  const [pageToken, setPageToken] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const [fbMesgul, setFbMesgul] = useState(false);
  const [adaylar, setAdaylar] = useState<
    Array<{ page_id: string; page_name: string | null; ig_user_id: string; ig_username: string | null }>
  >([]);
  const [seciliyor, setSeciliyor] = useState<string | null>(null);

  /** Facebook ile ekleme dönüşü: ?ig_extra=added|pick / ?ig_extra_error=… */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const durum = params.get('ig_extra');
    const hata = params.get('ig_extra_error');
    if (!durum && !hata) return;
    setAcik(true);
    if (durum === 'added') {
      const u = params.get('ig_username');
      toast.success(`${u ? `@${u}` : 'Instagram hesabı'} CRM'e eklendi`);
      void onDegisti();
    } else if (hata) {
      toast.error(
        hata === 'no_candidates'
          ? 'Eklenecek Instagram hesabı bulunamadı. Facebook penceresinde yeni hesabın bağlı olduğu sayfayı seçtiğinizden emin olun.'
          : `Instagram hesabı eklenemedi: ${hata}`,
        { duration: 10000 }
      );
    }
    for (const k of ['ig_extra', 'ig_extra_error', 'ig_username']) params.delete(k);
    const q = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adaylariYukle = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crm-comment-automations?op=accounts_pending');
      const j = await res.json().catch(() => ({}));
      setAdaylar(Array.isArray(j.items) ? j.items : []);
    } catch {
      setAdaylar([]);
    }
  }, []);

  useEffect(() => {
    if (acik) void adaylariYukle();
  }, [acik, adaylariYukle]);

  const facebookIleEkle = async () => {
    setFbMesgul(true);
    try {
      const res = await apiFetch('/api/meta/facebook-oauth?start=1&purpose=extra_ig');
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.authorize_url) throw new Error(j.error || 'Facebook girişi başlatılamadı');
      window.location.href = j.authorize_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Facebook girişi başlatılamadı');
      setFbMesgul(false);
    }
  };

  const adaySec = async (pid: string) => {
    setSeciliyor(pid);
    try {
      const res = await apiFetch('/api/crm-comment-automations?op=accounts_pick', {
        method: 'POST',
        body: JSON.stringify({ page_id: pid })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || 'Hesap eklenemedi');
      toast.success(`${j.item ? hesapAdi(j.item) : 'Hesap'} eklendi`);
      await adaylariYukle();
      await onDegisti();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hesap eklenemedi');
    } finally {
      setSeciliyor(null);
    }
  };

  const ekle = async () => {
    if (!pageId.trim() || !pageToken.trim()) {
      toast.error('Sayfa ID ve sayfa erişim anahtarı gerekli');
      return;
    }
    setMesgul(true);
    try {
      const res = await apiFetch('/api/crm-comment-automations?op=accounts', {
        method: 'POST',
        body: JSON.stringify({ page_id: pageId.trim(), page_token: pageToken.trim() })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || 'Hesap eklenemedi');
      const ad = j.item ? hesapAdi(j.item) : 'Hesap';
      if (j.subscription && j.subscription.ok === false) {
        toast.warning(`${ad} eklendi, ancak webhook aboneliği yapılamadı: ${j.subscription.error || ''}`);
      } else {
        toast.success(`${ad} eklendi`);
      }
      setPageId('');
      setPageToken('');
      await onDegisti();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hesap eklenemedi');
    } finally {
      setMesgul(false);
    }
  };

  const aktiflik = async (h: IgHesap) => {
    try {
      const res = await apiFetch('/api/crm-comment-automations?op=accounts', {
        method: 'PATCH',
        body: JSON.stringify({ id: h.id, is_active: !h.is_active })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || 'Güncellenemedi');
      await onDegisti();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    }
  };

  const sil = async (h: IgHesap) => {
    if (
      !window.confirm(
        `${hesapAdi(h)} hesabı silinsin mi? Bu hesaba bağlı otomasyonlar kapatılır. Geçici olarak durdurmak için "Pasif yap" yeterlidir.`
      )
    )
      return;
    try {
      const res = await apiFetch(`/api/crm-comment-automations?op=accounts&id=${encodeURIComponent(h.id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Silinemedi');
      toast.success('Hesap silindi');
      await onDegisti();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <button
        type="button"
        onClick={() => setAcik(!acik)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <Users className="h-3.5 w-3.5 text-pink-600" />
          Instagram hesapları ({1 + hesaplar.length})
        </span>
        <span className="text-[11px] font-medium text-indigo-700">{acik ? 'Gizle' : 'Yönet'}</span>
      </button>

      {acik ? (
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <b>Ana hesap</b>
            {anaHesap?.username || anaHesap?.ig_user_id ? (
              <span className="ml-1 text-slate-500">
                · {anaHesap.username ? `@${anaHesap.username}` : anaHesap.ig_user_id}
              </span>
            ) : null}
            <span className="ml-1 text-[11px] text-slate-400">(Meta bağlantı ayarlarından)</span>
          </div>

          {hesaplar.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0 text-xs">
                <p className="font-medium text-slate-900">
                  {hesapAdi(h)}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      h.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {h.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Sayfa: {h.page_id || '—'} · Anahtar: {h.token_masked || '—'}
                </p>
                {h.last_verify_error ? (
                  <p className="mt-0.5 text-[11px] text-amber-700">{h.last_verify_error}</p>
                ) : null}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void aktiflik(h)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {h.is_active ? 'Pasif yap' : 'Aktif yap'}
                </button>
                <button
                  type="button"
                  onClick={() => void sil(h)}
                  className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                  title="Sil"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {tabloYok ? (
            <p className="text-[11px] text-amber-700">
              Ek hesap tablosu henüz oluşturulmamış — veritabanı güncellemesi uygulanınca hesap eklenebilir.
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-2.5">
              <p className="text-[11px] font-medium text-slate-600">Yeni hesap ekle</p>
              <button
                type="button"
                disabled={fbMesgul}
                onClick={() => void facebookIleEkle()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1877F2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#166fe0] disabled:opacity-60"
              >
                {fbMesgul ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Facebook className="h-3.5 w-3.5" />}
                Facebook ile Instagram hesabı ekle
              </button>
              <p className="text-[11px] text-slate-500">
                Açılan Facebook penceresinde yeni Instagram hesabının bağlı olduğu sayfayı da seçin. Ana hesap
                değişmez; yeni hesabın yorumları ve DM'leri aynı gelen kutusuna düşer, yanıtlar o hesaptan gider.
              </p>

              {adaylar.length ? (
                <div className="space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2">
                  <p className="text-[11px] font-semibold text-indigo-900">Eklemek istediğiniz hesabı seçin</p>
                  {adaylar.map((a) => (
                    <div key={a.page_id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs">
                      <span className="min-w-0 truncate">
                        <b>{a.ig_username ? `@${a.ig_username}` : a.ig_user_id}</b>
                        <span className="ml-1 text-slate-500">· {a.page_name || a.page_id}</span>
                      </span>
                      <button
                        type="button"
                        disabled={seciliyor !== null}
                        onClick={() => void adaySec(a.page_id)}
                        className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
                      >
                        {seciliyor === a.page_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Ekle
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <details className="text-xs">
                <summary className="cursor-pointer text-[11px] text-slate-500">Elle ekle (sayfa anahtarı ile)</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Facebook Sayfa ID
                  <input
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    placeholder="1234567890"
                    className={input}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Sayfa erişim anahtarı
                  <input
                    type="password"
                    autoComplete="off"
                    value={pageToken}
                    onChange={(e) => setPageToken(e.target.value)}
                    placeholder="EAAG…"
                    className={input}
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                Sayfaya bağlı Instagram işletme hesabı otomatik bulunur ve sayfa yorum/mesaj
                bildirimlerine abone edilir. Anahtar sunucuda saklanır, burada yalnız maskeli görünür.
              </p>
              <button
                type="button"
                disabled={mesgul}
                onClick={() => void ekle()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
              >
                {mesgul ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Hesap ekle
              </button>
              </details>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
  const [yetenek, setYetenek] = useState<Yetenek | null>(null);
  const [yetenekYukleniyor, setYetenekYukleniyor] = useState(false);
  const [keywordText, setKeywordText] = useState('');
  const [testText, setTestText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hesaplar, setHesaplar] = useState<IgHesap[]>([]);
  const [anaHesap, setAnaHesap] = useState<AnaHesap | null>(null);
  const [hesapTablosuYok, setHesapTablosuYok] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crm-comment-automations?op=accounts');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setHesaplar(Array.isArray(j.items) ? j.items : []);
      setAnaHesap(j.primary || null);
      setHesapTablosuYok(j.table_missing === true);
    } catch {
      setHesaplar([]);
    }
  }, []);

  /** Otomasyon listesinde hesap adı */
  const otomasyonHesabi = (igUserId?: string | null): string => {
    if (!igUserId || igUserId === anaHesap?.ig_user_id) {
      return anaHesap?.username ? `Ana hesap (@${anaHesap.username})` : 'Ana hesap';
    }
    const h = hesaplar.find((x) => x.ig_user_id === igUserId);
    return h ? hesapAdi(h) : igUserId;
  };

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

  const loadMedia = useCallback(async (igUserId?: string | null) => {
    try {
      const qs = igUserId ? `&ig_user_id=${encodeURIComponent(igUserId)}` : '';
      const res = await apiFetch(`/api/crm-comment-automations?op=media${qs}`);
      const j = await res.json().catch(() => ({}));
      setMedia(Array.isArray(j.items) ? j.items : []);
      setMediaHint(j.ok === false ? j.hint || j.error || null : null);
    } catch {
      setMedia([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAccounts();
  }, [load, loadAccounts]);

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
    void loadMedia(a.ig_user_id || null);
  };

  /** Takip dogrulamasi calisiyor mu — hicbir mesaj gondermez */
  const yetenegiSor = async () => {
    setYetenekYukleniyor(true);
    try {
      const r = await apiFetch('/api/crm-comment-automations?op=follow-capability');
      const j = await r.json();
      setYetenek(j?.data || null);
    } catch {
      setYetenek({ neden: 'Yetenek denetimi yapılamadı.' });
    } finally {
      setYetenekYukleniyor(false);
    }
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
        body: JSON.stringify({ ...draft, keywords, ig_user_id: draft.ig_user_id || null })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || 'Kaydedilemedi');
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

      {!draft ? (
        <IgHesaplariBolumu
          hesaplar={hesaplar}
          anaHesap={anaHesap}
          tabloYok={hesapTablosuYok}
          onDegisti={loadAccounts}
        />
      ) : null}

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
                    {otomasyonHesabi(a.ig_user_id)} ·{' '}
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

          {hesaplar.length ? (
            <label className="block text-xs font-medium text-slate-600">
              Instagram hesabı
              <select
                value={draft.ig_user_id || ''}
                onChange={(e) => {
                  const ig = e.target.value || null;
                  // Gönderiler hesaba özel: hesap değişince gönderi seçimi sıfırlanır
                  setDraft({
                    ...draft,
                    ig_user_id: ig,
                    media_id: null,
                    media_caption: null,
                    media_permalink: null,
                    media_thumbnail_url: null
                  });
                  setMedia([]);
                  void loadMedia(ig);
                }}
                className={input}
              >
                <option value="">{otomasyonHesabi(null)}</option>
                {hesaplar.map((h) => (
                  <option key={h.id} value={h.ig_user_id} disabled={!h.is_active && h.ig_user_id !== draft.ig_user_id}>
                    {hesapAdi(h)}
                    {h.is_active ? '' : ' (pasif)'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

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

          {/* --- Takip kontrolu --- */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-test="takip-kapisi">
            <label className="flex items-start gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={draft.follow_gate_enabled === true}
                onChange={(e) => {
                  setDraft({ ...draft, follow_gate_enabled: e.target.checked });
                  if (e.target.checked && !yetenek) void yetenegiSor();
                }}
                className="mt-0.5"
                data-test="takip-kapisi-ac"
              />
              <span>
                <b>PDF göndermeden önce Instagram takip kontrolü yap</b>
                <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                  Açıkken yoruma önce takip daveti gider; PDF bağlantısı yalnızca takip
                  <b> Meta API ile doğrulandıktan sonra</b> gönderilir.
                </span>
              </span>
            </label>

            {draft.follow_gate_enabled ? (
              <div className="mt-3 space-y-3">
                {/* Yetenek durumu: dogrulama bu kurulumda calisiyor mu */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-slate-700">Takip doğrulaması durumu</b>
                    <button
                      type="button"
                      onClick={() => void yetenegiSor()}
                      disabled={yetenekYukleniyor}
                      className="font-semibold text-indigo-700 hover:underline disabled:opacity-50"
                    >
                      {yetenekYukleniyor ? 'Kontrol ediliyor…' : 'Yeniden kontrol et'}
                    </button>
                  </div>
                  {yetenek ? (
                    <div className="mt-1.5 space-y-1 text-slate-600">
                      <p>
                        Bağlantı: {yetenek.baglanti_var ? '✅' : '❌'} · Jeton:{' '}
                        {yetenek.token_calisiyor ? '✅' : '❌'} · Takip alanı:{' '}
                        {yetenek.alan_destekleniyor === true
                          ? '✅ okunabiliyor'
                          : yetenek.alan_destekleniyor === false
                            ? '❌ okunamıyor'
                            : '⏳ henüz sınanamadı'}
                      </p>
                      {yetenek.neden ? <p className="text-amber-800">{yetenek.neden}</p> : null}
                      {yetenek.oneri ? <p className="text-slate-500">{yetenek.oneri}</p> : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">Henüz kontrol edilmedi.</p>
                  )}
                  <p className="mt-1.5 text-slate-500">
                    Meta, takip durumunu yalnızca işletmeye <b>mesaj göndermiş</b> kullanıcılar için
                    verir. Akış bu yüzden önce DM + buton gönderir; butona basmak onayı oluşturur.
                    Doğrulama yapılamazsa PDF <b>gönderilmez</b>.
                  </p>
                </div>

                <label className="block text-xs font-medium text-slate-600">
                  Takip daveti mesajı (PDF bağlantısı KOYMAYIN)
                  <textarea
                    rows={3}
                    value={draft.follow_invite_text || ''}
                    onChange={(e) => setDraft({ ...draft, follow_invite_text: e.target.value })}
                    placeholder={'Merhaba! 👋 PDF için önce hesabımızı takip etmeniz gerekiyor ❤️'}
                    className={input}
                  />
                </label>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-600">
                    &quot;Takip Ettim&quot; butonu
                    <input
                      maxLength={20}
                      value={draft.follow_button_text || ''}
                      onChange={(e) => setDraft({ ...draft, follow_button_text: e.target.value })}
                      placeholder="✅ Takip Ettim"
                      className={input}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    &quot;Tekrar Kontrol Et&quot; butonu
                    <input
                      maxLength={20}
                      value={draft.follow_retry_button_text || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, follow_retry_button_text: e.target.value })
                      }
                      placeholder="🔄 Tekrar Kontrol Et"
                      className={input}
                    />
                  </label>
                </div>

                <label className="block text-xs font-medium text-slate-600">
                  Takip etmeyen kullanıcıya gönderilecek mesaj
                  <textarea
                    rows={2}
                    value={draft.follow_retry_text || ''}
                    onChange={(e) => setDraft({ ...draft, follow_retry_text: e.target.value })}
                    placeholder="Henüz takip ettiğinizi doğrulayamadık 😊"
                    className={input}
                  />
                </label>

                <p className="text-[11px] text-slate-500">
                  Doğrulama sonrası gönderilecek PDF mesajı yukarıdaki{' '}
                  <b>Gönderilecek özel mesaj</b> alanıdır. Yorum altı yanıtı yalnızca PDF
                  gerçekten gönderildikten sonra verilir.
                </p>
              </div>
            ) : null}
          </div>

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
