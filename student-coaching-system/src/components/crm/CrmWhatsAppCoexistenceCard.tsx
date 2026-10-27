import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  completeWaCoexistence,
  getWaCoexistenceSetup,
  listenEmbeddedSignup,
  loadFacebookSdk,
  saveWaCoexistenceConfigId,
  type EmbeddedSignupSession,
  type WaCoexistenceResult,
  type WaCoexistenceSetup
} from '../../lib/waCoexistenceApi';

const STEP_LABELS: Record<string, string> = {
  code_exchange: 'Meta oturumu doğrulandı',
  session_info: 'WhatsApp hesabı seçildi',
  phone_lookup: 'Numara bulundu',
  token_choice: 'Erişim anahtarı seçildi',
  save_settings: 'CRM ayarı güncellendi',
  webhook_bind: 'Gelen mesaj bağlantısı kuruldu',
  sync_smb_app_state_sync: 'Rehber senkronu başlatıldı',
  sync_history: 'Sohbet geçmişi senkronu başlatıldı'
};

/**
 * Telefondaki WhatsApp Business uygulamasını kapatmadan numarayı CRM’e bağlar
 * (Meta Embedded Signup — birlikte kullanım / coexistence).
 */
export default function CrmWhatsAppCoexistenceCard() {
  const [setup, setSetup] = useState<WaCoexistenceSetup | null>(null);
  const [configInput, setConfigInput] = useState('');
  const [busy, setBusy] = useState<'save' | 'connect' | null>(null);
  const [result, setResult] = useState<WaCoexistenceResult | null>(null);
  const sessionRef = useRef<EmbeddedSignupSession>({});

  const load = async () => {
    try {
      setSetup(await getWaCoexistenceSetup());
    } catch (e) {
      setSetup(null);
      toast.error(e instanceof Error ? e.message : 'Durum okunamadı');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => listenEmbeddedSignup((s) => {
    sessionRef.current = { ...sessionRef.current, ...s };
  }), []);

  const saveConfig = async () => {
    if (!configInput.trim()) return;
    setBusy('save');
    try {
      setSetup(await saveWaCoexistenceConfigId(configInput.trim()));
      setConfigInput('');
      toast.success('Yapılandırma kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(null);
    }
  };

  const waitForSession = async (ms: number) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (sessionRef.current.waba_id || sessionRef.current.cancelled) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const connect = async () => {
    if (!setup?.ready) return;
    setBusy('connect');
    setResult(null);
    sessionRef.current = {};
    try {
      const FB = await loadFacebookSdk(setup.app_id, setup.graph_version);
      const code = await new Promise<string>((resolve, reject) => {
        FB.login(
          (response) => {
            const c = response?.authResponse?.code;
            if (c) resolve(c);
            else reject(new Error('Meta penceresi tamamlanmadan kapandı'));
          },
          {
            config_id: setup.config_id,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: setup.feature_type,
              sessionInfoVersion: '3'
            }
          }
        );
      });
      await waitForSession(5000);
      if (sessionRef.current.cancelled) throw new Error('Kurulum iptal edildi');
      const r = await completeWaCoexistence({
        code,
        waba_id: sessionRef.current.waba_id,
        phone_number_id: sessionRef.current.phone_number_id,
        event: sessionRef.current.event
      });
      setResult(r);
      if (r.ok) toast.success(`${r.display_phone || 'Numara'} CRM’e bağlandı`);
      else toast.error(r.error || 'Bağlantı tamamlanamadı — adımlara bakın');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlanamadı');
    } finally {
      setBusy(null);
    }
  };

  const steps = result?.steps || setup?.last_onboarding?.steps || [];

  return (
    <section
      id="whatsapp-isletme-uygulamasi"
      className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-4 shadow-sm sm:p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Telefon + CRM birlikte</p>
      <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Smartphone className="h-5 w-5 text-emerald-700" />
        WhatsApp Business uygulamasını bağla
      </h3>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Numara telefondaki WhatsApp Business’ta çalışmaya devam eder; gelen mesajlar ve telefondan yazılan
        yanıtlar CRM gelen kutusuna da düşer. Meta penceresinde numarayı seçip telefonla QR kodu okutmanız yeterli.
      </p>

      {!setup ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {!setup.has_app_secret ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              Önce aşağıdaki Instagram kartından SmartKocluk App Secret’ı kaydedin.
            </p>
          ) : null}

          {!setup.config_id ? (
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-800">Embedded Signup yapılandırma kimliği</p>
              <p className="mt-1 text-xs text-slate-500">
                Meta Uygulama Paneli → Facebook Login for Business → Yapılandırmalar → “WhatsApp Embedded Signup”
                türünde bir yapılandırma oluşturun ve kimliğini buraya yapıştırın.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={configInput}
                  onChange={(e) => setConfigInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="ör. 123456789012345"
                  inputMode="numeric"
                  className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void saveConfig()}
                  disabled={busy !== null || !configInput.trim()}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Yapılandırma: …{setup.config_id.slice(-6)} {setup.config_source === 'env' ? '(Vercel)' : '(panel)'}
            </p>
          )}

          <button
            type="button"
            onClick={() => void connect()}
            disabled={!setup.ready || busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {busy === 'connect' ? 'Bağlanıyor…' : 'WhatsApp Business uygulamasını bağla'}
          </button>

          {steps.length ? (
            <ul className="space-y-1 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200">
              {steps.map((s) => (
                <li key={s.step} className="flex items-start gap-2">
                  {s.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  )}
                  <span className="text-slate-700">
                    {STEP_LABELS[s.step] || s.step}
                    {s.error ? <span className="block text-xs text-rose-700">{s.error}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
