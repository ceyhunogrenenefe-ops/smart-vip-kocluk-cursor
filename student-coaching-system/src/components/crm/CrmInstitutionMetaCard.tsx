import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plug, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmGetMetaConnection,
  crmSaveMetaConnection,
  crmVerifyMetaConnection,
  type CrmMetaConnection
} from '../../lib/crmInboxApi';

const input =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none';

/**
 * Kurumun kendi Meta (WhatsApp Cloud API + Instagram) hesabını bağladığı kart.
 * Platform kurumunda gösterilmez — orada genel ayarlar geçerlidir.
 */
export default function CrmInstitutionMetaCard() {
  const [data, setData] = useState<CrmMetaConnection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    wa_token: '',
    wa_phone_number_id: '',
    wa_waba_id: '',
    ig_page_token: '',
    ig_page_id: '',
    ig_user_id: '',
    ig_username: ''
  });

  const load = async () => {
    try {
      const r = await crmGetMetaConnection();
      setData(r.data);
      setForm((f) => ({
        ...f,
        wa_phone_number_id: r.data.whatsapp.phone_number_id || '',
        wa_waba_id: r.data.whatsapp.waba_id || '',
        ig_page_id: r.data.instagram.page_id || '',
        ig_user_id: r.data.instagram.ig_user_id || '',
        ig_username: r.data.instagram.username || ''
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlantı durumu alınamadı');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!data || data.is_platform) return null;

  const save = async () => {
    setBusy('save');
    try {
      // Boş bırakılan gizli alanlar değişmez; yalnız doldurulanlar gönderilir
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (k.endsWith('_token')) {
          if (v.trim()) payload[k] = v.trim();
        } else {
          payload[k] = v.trim();
        }
      }
      const r = await crmSaveMetaConnection(payload);
      setData(r.data);
      setForm((f) => ({ ...f, wa_token: '', ig_page_token: '' }));
      toast.success('Bağlantı kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setBusy('verify');
    try {
      const r = await crmVerifyMetaConnection();
      setData(r.data);
      if (r.result.ok) {
        toast.success(
          `WhatsApp doğrulandı: ${r.result.display_phone_number || ''} ${r.result.verified_name || ''}`.trim()
        );
      } else {
        toast.error(r.result.error || 'Doğrulanamadı');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Doğrulanamadı');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Kurumunuzun hesabı</p>
      <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Plug className="h-5 w-5 text-emerald-700" />
        WhatsApp ve Instagram bağlantısı
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Bu kurumun mesajları kendi Meta hesabından gider ve gelen mesajlar bu kurumun gelen kutusuna düşer.
        Bilgileri Meta iş yöneticinizden (business.facebook.com) alırsınız.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
            data.whatsapp.connected
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              : 'bg-slate-50 text-slate-600 ring-slate-200'
          }`}
        >
          {data.whatsapp.connected ? <CheckCircle2 className="h-4 w-4" /> : null}
          WhatsApp: {data.whatsapp.connected ? data.whatsapp.display_phone || 'bağlı' : 'bağlı değil'}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
            data.instagram.connected
              ? 'bg-pink-50 text-pink-800 ring-pink-200'
              : 'bg-slate-50 text-slate-600 ring-slate-200'
          }`}
        >
          Instagram: {data.instagram.connected ? data.instagram.username || 'bağlı' : 'bağlı değil'}
        </span>
        {data.last_verify_error ? (
          <span className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-700 ring-1 ring-rose-200">
            Son doğrulama hatası: {data.last_verify_error}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">WhatsApp Cloud API</p>
          <label className="block text-xs font-medium text-slate-600">
            Kalıcı erişim anahtarı (access token)
            <input
              type="password"
              value={form.wa_token}
              onChange={(e) => setForm({ ...form, wa_token: e.target.value })}
              placeholder={data.whatsapp.token_masked || 'EAAG…'}
              className={input}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Numara kimliği (phone number ID)
            <input
              value={form.wa_phone_number_id}
              onChange={(e) => setForm({ ...form, wa_phone_number_id: e.target.value })}
              className={input}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            WABA kimliği (isteğe bağlı)
            <input
              value={form.wa_waba_id}
              onChange={(e) => setForm({ ...form, wa_waba_id: e.target.value })}
              className={input}
            />
          </label>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">Instagram / Facebook</p>
          <label className="block text-xs font-medium text-slate-600">
            Sayfa erişim anahtarı (page access token)
            <input
              type="password"
              value={form.ig_page_token}
              onChange={(e) => setForm({ ...form, ig_page_token: e.target.value })}
              placeholder={data.instagram.token_masked || 'EAAG…'}
              className={input}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Instagram iş hesabı kimliği
            <input
              value={form.ig_user_id}
              onChange={(e) => setForm({ ...form, ig_user_id: e.target.value })}
              className={input}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-slate-600">
              Facebook sayfa kimliği
              <input
                value={form.ig_page_id}
                onChange={(e) => setForm({ ...form, ig_page_id: e.target.value })}
                className={input}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Kullanıcı adı
              <input
                value={form.ig_username}
                onChange={(e) => setForm({ ...form, ig_username: e.target.value })}
                placeholder="@kurum"
                className={input}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Kaydet
        </button>
        <button
          type="button"
          disabled={busy != null || !data.whatsapp.connected}
          onClick={() => void verify()}
          title={data.whatsapp.connected ? 'Meta ile bağlantıyı test et' : 'Önce WhatsApp bilgilerini kaydedin'}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
        >
          {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Bağlantıyı doğrula
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Anahtarlar kaydedildikten sonra ekranda gösterilmez; yalnız son dört hanesi görünür. Boş bırakırsanız
        mevcut anahtar korunur.
      </p>
    </section>
  );
}
