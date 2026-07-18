import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchVeliImzaPayload, submitVeliImza, submitVeliRegistrationForm, type VeliImzaRegistrationHint } from '../lib/parentSignApi';
import { downloadParentSignContractPdf } from '../lib/parentSignPdfDownload';
import {
  VELI_KAYIT_MAX_PROGRAMS,
  VELI_KAYIT_PROGRAM_SECENEKLERI,
  joinVeliProgramAdlari,
  splitVeliProgramAdi
} from '../lib/veliKayitConstants';
import { isMaarifVeliProgram } from '../lib/veliKayitClassLevel';
import { formatUcretWithCurrency } from '../lib/parentSignApi';
import {
  VELI_KAYIT_KVKK_DOC_HREF,
  VELI_KAYIT_SATIS_ONBILGI_DOC_HREF,
  resolveKvkkDocUrl,
  resolveSatisDocUrl
} from '../lib/veliKayitLegalLinks';
import { ODEME_TERCIHI_VELI_OPTIONS, type OdemeTercihiVeli } from '../lib/odemeSekli';
import { CheckCircle2, Download, FileText, Loader2 } from 'lucide-react';

type RegFields = {
  ogrenci_ad: string;
  ogrenci_soyad: string;
  veli_ad: string;
  veli_soyad: string;
  tc_kimlik: string;
  dogum_tarihi: string;
  okul_adi: string;
  sinif_form: string;
  program_forms: string[];
  eposta: string;
  il: string;
  ilce: string;
  adres_aciklama: string;
  veli_tel: string;
  ogrenci_tel: string;
  kvkk_form_ok: boolean;
  satis_kvkk_form_ok: boolean;
  odeme_tercihi_veli: string;
};

const emptyReg = (): RegFields => ({
  ogrenci_ad: '',
  ogrenci_soyad: '',
  veli_ad: '',
  veli_soyad: '',
  tc_kimlik: '',
  dogum_tarihi: '',
  okul_adi: '',
  sinif_form: '',
  program_forms: [],
  eposta: '',
  il: '',
  ilce: '',
  adres_aciklama: '',
  veli_tel: '',
  ogrenci_tel: '',
  kvkk_form_ok: false,
  satis_kvkk_form_ok: false,
  odeme_tercihi_veli: 'henuz_odemedi'
});

function hintMoney(n: unknown): string {
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : '—';
}

export default function VeliImzaPage() {
  const { token } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [html, setHtml] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [kvkk, setKvkk] = useState(false);
  const [soz, setSoz] = useState(false);
  const [saving, setSaving] = useState(false);
  const [institutionName, setInstitutionName] = useState('');
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [needsStudentForm, setNeedsStudentForm] = useState(false);
  const [regHint, setRegHint] = useState<VeliImzaRegistrationHint | null>(null);
  const [rf, setRf] = useState<RegFields>(emptyReg);
  const [regSaving, setRegSaving] = useState(false);
  const [awaitingAdminPrice, setAwaitingAdminPrice] = useState(false);
  const [kvkkDocHref, setKvkkDocHref] = useState(VELI_KAYIT_KVKK_DOC_HREF);
  const [satisDocHref, setSatisDocHref] = useState(VELI_KAYIT_SATIS_ONBILGI_DOC_HREF);
  const [programIcerikHref, setProgramIcerikHref] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionName) return;
    const label = needsStudentForm && !signed ? 'Kayıt formu' : signed ? 'Veli onayı' : 'Sözleşme';
    const prev = document.title;
    document.title = `${institutionName} — ${label}`;
    return () => {
      document.title = prev;
    };
  }, [institutionName, needsStudentForm, signed]);

  const loadPayload = useCallback(async () => {
    if (!token) throw new Error('Geçersiz bağlantı');
    const d = await fetchVeliImzaPayload(token);
    setHtml(d.merged_html);
    setContractNo(d.contract_number);
    const done = Boolean(d.already_signed || d.signed_at);
    setSigned(done);
    setInstitutionName(String(d.institution_name || '').trim());
    setSignaturePng(d.signature_png_base64 && d.signature_png_base64.length > 80 ? d.signature_png_base64 : null);
    setNeedsStudentForm(Boolean(d.needs_student_form));
    setAwaitingAdminPrice(Boolean(d.awaiting_admin_price));
    setRegHint(d.registration_hint || null);
    setKvkkDocHref(resolveKvkkDocUrl(d.kvkk_doc_href || VELI_KAYIT_KVKK_DOC_HREF));
    setSatisDocHref(resolveSatisDocUrl(d.satis_doc_href || VELI_KAYIT_SATIS_ONBILGI_DOC_HREF));
    const pic = d.program_icerik_href != null ? String(d.program_icerik_href).trim() : '';
    setProgramIcerikHref(pic || null);
    return d;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        setErr('Geçersiz bağlantı');
        setBusy(false);
        return;
      }
      try {
        await loadPayload();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Yüklenemedi');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadPayload]);

  useEffect(() => {
    if (!needsStudentForm || !regHint) return;
    const hintedPrograms = (regHint.programlar?.length
      ? regHint.programlar
      : splitVeliProgramAdi(String(regHint.program_adi || ''))
    )
      .map((p) => String(p || '').trim())
      .filter((p) => VELI_KAYIT_PROGRAM_SECENEKLERI.includes(p))
      .slice(0, VELI_KAYIT_MAX_PROGRAMS);
    const pick = (current: string, next: unknown) => {
      if (String(current || '').trim()) return current;
      const v = String(next ?? '').trim();
      return v || current;
    };
    setRf((f) => ({
      ...f,
      program_forms: f.program_forms.length ? f.program_forms : hintedPrograms,
      sinif_form: pick(f.sinif_form, regHint.sinif),
      ogrenci_ad: pick(f.ogrenci_ad, regHint.ogrenci_ad),
      ogrenci_soyad: pick(f.ogrenci_soyad, regHint.ogrenci_soyad),
      veli_ad: pick(f.veli_ad, regHint.veli_ad),
      veli_soyad: pick(f.veli_soyad, regHint.veli_soyad),
      veli_tel: pick(f.veli_tel, regHint.veli_tel),
      ogrenci_tel: pick(f.ogrenci_tel, regHint.ogrenci_tel || regHint.veli_tel),
      eposta: pick(f.eposta, regHint.eposta),
      dogum_tarihi: pick(f.dogum_tarihi, regHint.dogum_tarihi),
      okul_adi: pick(f.okul_adi, regHint.okul_adi),
      il: pick(f.il, regHint.il),
      ilce: pick(f.ilce, regHint.ilce),
      adres_aciklama: pick(f.adres_aciklama, regHint.adres_aciklama)
    }));
  }, [needsStudentForm, regHint]);

  const toggleVeliProgram = (name: string) => {
    setRf((p) => {
      const cur = p.program_forms;
      if (cur.includes(name)) {
        return { ...p, program_forms: cur.filter((x) => x !== name) };
      }
      if (cur.length >= VELI_KAYIT_MAX_PROGRAMS) {
        setErr(`En fazla ${VELI_KAYIT_MAX_PROGRAMS} program seçebilirsiniz.`);
        return p;
      }
      const next = [...cur, name];
      return {
        ...p,
        program_forms: next,
        sinif_form: isMaarifVeliProgram(name) ? 'TYT-Maarif' : p.sinif_form
      };
    });
    setErr(null);
  };

  useEffect(() => {
    if (!awaitingAdminPrice || signed || !token) return;
    const tick = () => {
      void loadPayload().catch(() => {});
    };
    tick();
    const t = window.setInterval(tick, 5000);
    return () => window.clearInterval(t);
  }, [awaitingAdminPrice, signed, token, loadPayload]);

  /** Ücret girildikten sonra veli sekmesi / uygulamaya dönünce hemen güncelle (yoklama + önbellek sorunlarına karşı). */
  useEffect(() => {
    if (!token || signed) return;
    const refresh = () => {
      void loadPayload().catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token, signed, loadPayload]);

  const resizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.parentElement?.getBoundingClientRect();
    if (!r) return;
    c.width = Math.floor(r.width);
    c.height = 180;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas, html]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    if ('touches' in e && e.touches[0]) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    }
    const me = e as React.MouseEvent;
    return { x: me.clientX - r.left, y: me.clientY - r.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (signed || needsStudentForm || awaitingAdminPrice) return;
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || signed || needsStudentForm || awaitingAdminPrice) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const endDraw = () => {
    drawing.current = false;
  };

  const submitRegistration = async () => {
    if (!token || signed) return;
    if (!rf.kvkk_form_ok || !rf.satis_kvkk_form_ok) {
      setErr('KVKK ve satış sözleşmesi bilgilendirme onaylarını işaretleyin.');
      return;
    }
    const selectedPrograms = rf.program_forms.filter((p) => VELI_KAYIT_PROGRAM_SECENEKLERI.includes(p));
    if (selectedPrograms.length < 1) {
      setErr(`Lütfen listeden en az bir program seçin (en fazla ${VELI_KAYIT_MAX_PROGRAMS}).`);
      return;
    }
    if (selectedPrograms.length > VELI_KAYIT_MAX_PROGRAMS) {
      setErr(`En fazla ${VELI_KAYIT_MAX_PROGRAMS} program seçebilirsiniz.`);
      return;
    }
    const veliDigits = rf.veli_tel.replace(/\D/g, '');
    const ogrDigits = rf.ogrenci_tel.replace(/\D/g, '');
    if (veliDigits.length < 10 || veliDigits.length > 15) {
      setErr('Veli telefonu zorunludur; TR (05xx…) veya yurt dışı ülke kodu ile en az 10 rakam girin.');
      return;
    }
    if (ogrDigits.length < 10 || ogrDigits.length > 15) {
      setErr('Öğrenci telefonu zorunludur; TR (05xx…) veya yurt dışı ülke kodu ile en az 10 rakam girin.');
      return;
    }
    if (!rf.adres_aciklama.trim()) {
      setErr('Adres zorunludur.');
      return;
    }
    if (!rf.ilce.trim()) {
      setErr('İlçe zorunludur.');
      return;
    }
    if (!rf.il.trim()) {
      setErr('İl zorunludur.');
      return;
    }
    setRegSaving(true);
    setErr(null);
    try {
      await submitVeliRegistrationForm({
        signing_token: token,
        kvkk_form_ok: rf.kvkk_form_ok,
        satis_kvkk_form_ok: rf.satis_kvkk_form_ok,
        ogrenci_ad: rf.ogrenci_ad.trim(),
        ogrenci_soyad: rf.ogrenci_soyad.trim(),
        veli_ad: rf.veli_ad.trim(),
        veli_soyad: rf.veli_soyad.trim(),
        tc_kimlik: rf.tc_kimlik.trim(),
        dogum_tarihi: rf.dogum_tarihi.trim(),
        okul_adi: rf.okul_adi.trim(),
        sinif_form: rf.sinif_form.trim(),
        program_form: joinVeliProgramAdlari(selectedPrograms),
        program_formlar: selectedPrograms,
        eposta: rf.eposta.trim(),
        il: rf.il.trim(),
        ilce: rf.ilce.trim(),
        adres_aciklama: rf.adres_aciklama.trim(),
        veli_tel: rf.veli_tel.trim(),
        ogrenci_tel: rf.ogrenci_tel.trim(),
        odeme_tercihi_veli: rf.odeme_tercihi_veli
      });
      await loadPayload();
      setKvkk(false);
      setSoz(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Form gönderilemedi');
    } finally {
      setRegSaving(false);
    }
  };

  const submit = async () => {
    if (!token || signed || needsStudentForm || awaitingAdminPrice) return;
    if (!kvkk || !soz) {
      setErr('Lütfen yukarıdaki onay kutularını işaretleyin.');
      return;
    }
    const c = canvasRef.current;
    if (!c) return;
    const png = c.toDataURL('image/png');
    if (png.length < 200) {
      setErr('Lütfen imza alanında imzanızı atın.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await submitVeliImza({
        signing_token: token,
        signature_png_base64: png,
        kvkk_ok: true,
        contract_ok: true
      });
      setSigned(true);
      setSignaturePng(png);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const downloadContractPdf = async () => {
    if (!html) return;
    setPdfBusy(true);
    setErr(null);
    try {
      await downloadParentSignContractPdf({
        html,
        signaturePng: signaturePng,
        contractNo
      });
    } catch (e) {
      console.error(e);
      setErr('PDF oluşturulamadı. Tekrar deneyin.');
    } finally {
      setPdfBusy(false);
    }
  };

  const showContractBlock = !needsStudentForm || signed;
  const showSignPanel = !signed && !needsStudentForm && !awaitingAdminPrice;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-950 text-white px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-8 h-8 text-red-400" />
          <div>
            <p className="text-xs uppercase tracking-widest text-blue-300">
              {institutionName || 'Kurum'}
            </p>
            <h1 className="text-xl font-bold leading-tight">
              {needsStudentForm && !signed
                ? 'Kayıt bilgisi'
                : awaitingAdminPrice && !signed
                  ? 'Kayıt alındı — ücret bekleniyor'
                  : 'Veli onayı ve e-imza'}
            </h1>
            {contractNo ? <p className="text-sm text-slate-300 font-mono mt-1">{contractNo}</p> : null}
          </div>
        </div>

        {busy ? (
          <div className="flex items-center gap-2 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin" /> Yükleniyor…
          </div>
        ) : err && !html ? (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-red-200">{err}</div>
        ) : (
          <>
            {needsStudentForm && !signed ? (
              <div className="rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl p-4 mb-5 space-y-3 text-sm">
                <p className="text-slate-700 font-semibold">Kayıt bilgisi gönder</p>
                <p className="text-xs text-slate-500">
                  Kurumun önceden girdiği veya öğrenci kartındaki bilgiler formda otomatik doludur; eksik alanları
                  tamamlayıp gönderin. Kurum ücret ve taksiti girdikten sonra bu bağlantıda e-sözleşme görünür ve
                  imzalayabilirsiniz. <strong>Zorunlu alanlar:</strong> öğrenci adı/soyadı, veli adı/soyadı, öğrenci ve
                  veli telefonu (en az 10 rakam), e-posta, program seçimi (en fazla 2), adres, ilçe ve il. Bu alanlar doldurulmadan
                  form gönderilmez. Aşağıdaki onay satırlarındaki <span className="text-blue-700">mavi bağlantılar</span> ile
                  KVKK ve satış / ön bilgilendirme metinlerini sitemizde ayrı sayfada (çoğu tarayıcıda yeni sekmede) açabilirsiniz.
                </p>
                {regHint ? (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600 space-y-0.5">
                    <p>
                      <strong>Ön bilgi — program:</strong> {String(regHint.program_adi || '—')}
                    </p>
                    <p>
                      <strong>Sınıf:</strong> {String(regHint.sinif || '—')}
                    </p>
                    <p>
                      <strong>Dönem:</strong> {String(regHint.baslangic_tarihi || '').slice(0, 10)} –{' '}
                      {String(regHint.bitis_tarihi || '').slice(0, 10)}
                    </p>
                    <p>
                      <strong>Ücret (kurum girecek):</strong>{' '}
                      {Number(regHint.ucret) > 0
                        ? formatUcretWithCurrency(regHint.ucret!, regHint.para_birimi)
                        : '—'}{' '}
                      · <strong>Taksit:</strong>{' '}
                      {String(regHint.taksit_sayisi ?? '—')}
                    </p>
                    {programIcerikHref ? (
                      <p className="pt-1">
                        <a
                          href={programIcerikHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
                        >
                          Program içeriğini incele
                        </a>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] text-slate-500">Öğrenci adı (zorunlu)</label>
                    <input
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.ogrenci_ad}
                      onChange={(e) => setRf((p) => ({ ...p, ogrenci_ad: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Öğrenci soyadı (zorunlu)</label>
                    <input
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.ogrenci_soyad}
                      onChange={(e) => setRf((p) => ({ ...p, ogrenci_soyad: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Öğrenci sınıfı</label>
                    <input
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.sinif_form}
                      onChange={(e) => setRf((p) => ({ ...p, sinif_form: e.target.value }))}
                      placeholder="Örn. 9, LGS, 12"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Öğrenci telefonu (zorunlu)</label>
                    <input
                      required
                      inputMode="tel"
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.ogrenci_tel}
                      onChange={(e) => setRf((p) => ({ ...p, ogrenci_tel: e.target.value }))}
                      placeholder="05xx… veya +49 151…"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Veli adı (zorunlu)</label>
                    <input
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.veli_ad}
                      onChange={(e) => setRf((p) => ({ ...p, veli_ad: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Veli soyadı (zorunlu)</label>
                    <input
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.veli_soyad}
                      onChange={(e) => setRf((p) => ({ ...p, veli_soyad: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Veli telefonu (zorunlu)</label>
                    <input
                      required
                      inputMode="tel"
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.veli_tel}
                      onChange={(e) => setRf((p) => ({ ...p, veli_tel: e.target.value }))}
                      placeholder="05xx… veya +49 151…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-500">Okul adı</label>
                    <input
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.okul_adi}
                      onChange={(e) => setRf((p) => ({ ...p, okul_adi: e.target.value }))}
                      placeholder="Okulun tam adı"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Doğum tarihi</label>
                    <input
                      type="date"
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.dogum_tarihi}
                      onChange={(e) => setRf((p) => ({ ...p, dogum_tarihi: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">T.C. kimlik no</label>
                    <input
                      inputMode="numeric"
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.tc_kimlik}
                      onChange={(e) => setRf((p) => ({ ...p, tc_kimlik: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                      placeholder="11 hane"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-500">
                      Kayıt olmak istediği program (zorunlu — en fazla {VELI_KAYIT_MAX_PROGRAMS} seçim)
                    </label>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Örneğin hem yaz kampı hem dönem programına kayıt için iki programı işaretleyebilirsiniz.
                      {rf.program_forms.length > 0 ? (
                        <span className="block mt-0.5 font-medium text-slate-700">
                          Seçilen: {joinVeliProgramAdlari(rf.program_forms)}
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-1">
                      {VELI_KAYIT_PROGRAM_SECENEKLERI.map((p) => {
                        const checked = rf.program_forms.includes(p);
                        const disabled = !checked && rf.program_forms.length >= VELI_KAYIT_MAX_PROGRAMS;
                        return (
                          <label
                            key={p}
                            className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                              disabled ? 'opacity-45 cursor-not-allowed' : 'hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 shrink-0"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleVeliProgram(p)}
                            />
                            <span>{p}</span>
                          </label>
                        );
                      })}
                    </div>
                    {programIcerikHref ? (
                      <p className="mt-1.5 text-[11px] text-slate-600">
                        <a
                          href={programIcerikHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
                        >
                          Program içeriğini incele
                        </a>
                        {' '}
                        — kayıt olmadan önce program detaylarına bakabilirsiniz.
                      </p>
                    ) : null}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-500">E-posta adresi (zorunlu)</label>
                    <input
                      type="email"
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.eposta}
                      onChange={(e) => setRf((p) => ({ ...p, eposta: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-500">Adres (zorunlu)</label>
                    <input
                      required
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.adres_aciklama}
                      onChange={(e) => setRf((p) => ({ ...p, adres_aciklama: e.target.value }))}
                      placeholder="Mahalle, sokak, bina ve kapı no"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">İlçe (zorunlu)</label>
                    <input
                      required
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.ilce}
                      onChange={(e) => setRf((p) => ({ ...p, ilce: e.target.value }))}
                      placeholder="İlçe adı"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">İl (zorunlu)</label>
                    <input
                      required
                      className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={rf.il}
                      onChange={(e) => setRf((p) => ({ ...p, il: e.target.value }))}
                      placeholder="İl adı"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-700">Ödeme durumu / tercihi</p>
                  {ODEME_TERCIHI_VELI_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="odeme_tercihi_veli"
                        className="mt-0.5 h-4 w-4 shrink-0 border-slate-400"
                        checked={rf.odeme_tercihi_veli === opt.value}
                        onChange={() =>
                          setRf((p) => ({ ...p, odeme_tercihi_veli: opt.value as OdemeTercihiVeli }))
                        }
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                  <p className="text-[10px] text-slate-500">
                    Bu bilgi kuruma iletilir; kesin ödeme planını kurum belirler.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400"
                    checked={rf.kvkk_form_ok}
                    onChange={(e) => setRf((p) => ({ ...p, kvkk_form_ok: e.target.checked }))}
                  />
                  <span className="leading-relaxed">
                    <a
                      href={kvkkDocHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
                      onClick={(e) => e.stopPropagation()}
                    >
                      6698 sayılı KVKK bilgilendirmesi
                    </a>
                    {' '}
                    metnini okudum ve onaylıyorum.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400"
                    checked={rf.satis_kvkk_form_ok}
                    onChange={(e) => setRf((p) => ({ ...p, satis_kvkk_form_ok: e.target.checked }))}
                  />
                  <span className="leading-relaxed">
                    <a
                      href={satisDocHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-700 underline decoration-blue-400/70 underline-offset-2 hover:text-blue-900"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Satış sözleşmesi ve ön bilgilendirme
                    </a>
                    {' '}
                    metnini okudum; kayıt öncesi bilgilendirme ve sözleşme sürecine onay veriyorum.
                  </span>
                </label>
                {err ? <p className="text-sm text-red-600">{err}</p> : null}
                <button
                  type="button"
                  disabled={regSaving}
                  onClick={() => void submitRegistration()}
                  className="w-full rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow disabled:opacity-50"
                >
                  {regSaving ? 'Gönderiliyor…' : 'Kayıt bilgisini gönder'}
                </button>
              </div>
            ) : null}

            {awaitingAdminPrice && !signed ? (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 mb-4 text-sm text-amber-50 space-y-2">
                <p className="font-semibold">Kurum ücreti ve taksit bilgisi bekleniyor</p>
                <p className="text-xs text-amber-100/90">
                  Bu sayfa birkaç saniyede bir otomatik yenilenir; sekmeye döndüğünüzde de güncellenir. Hazır
                  olduğunda aşağıda tam sözleşme metni görünür ve
                  imzalayabilirsiniz.
                </p>
                <button
                  type="button"
                  className="w-full rounded-lg border border-amber-400/60 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900/50"
                  onClick={() => {
                    setBusy(true);
                    void loadPayload()
                      .catch((e) => setErr(e instanceof Error ? e.message : 'Yüklenemedi'))
                      .finally(() => setBusy(false));
                  }}
                >
                  Şimdi yenile
                </button>
              </div>
            ) : null}

            {showContractBlock ? (
              <div className="rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl overflow-hidden mb-5 max-h-[42vh] overflow-y-auto">
                <div className="p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            ) : null}

            {!signed && showSignPanel ? (
              <p className="text-xs text-slate-400 mb-3 text-center">
                İmzadan sonra bu sayfada <strong>PDF olarak indir</strong> düğmesi görünür.
              </p>
            ) : null}

            {signed ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/50 p-4 flex items-center gap-2 text-emerald-100 text-sm">
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  Kaydınız alındı. Kurum tarafında imzalı olarak görünecektir. Teşekkür ederiz.
                </div>
                <button
                  type="button"
                  disabled={pdfBusy || !html}
                  onClick={() => void downloadContractPdf()}
                  className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-emerald-950 shadow-lg hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 border border-emerald-300"
                >
                  {pdfBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  PDF olarak indir
                </button>
              </div>
            ) : showSignPanel ? (
              <div className="rounded-2xl border border-white/15 bg-slate-900/70 p-4 space-y-4 backdrop-blur-sm">
                <p className="text-sm font-semibold text-white border-b border-white/10 pb-2">Onaylar</p>
                <label className="flex items-start gap-3 text-sm text-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={kvkk}
                    onChange={(e) => setKvkk(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-400"
                  />
                  <span>
                    <strong>6698 sayılı KVKK</strong> ve kişisel verilerin işlenmesine ilişkin bilgilendirme metnini
                    okudum, anladım ve onaylıyorum.
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soz}
                    onChange={(e) => setSoz(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-400"
                  />
                  <span>
                    Yukarıdaki özet ve <strong>kayıt koşullarını / sözleşme hükümlerini</strong> okudum; veli sıfatıyla
                    kabul ve beyan ediyorum.
                  </span>
                </label>

                <div>
                  <p className="text-sm font-semibold text-white mb-2">E-imza (parmak veya fare ile çizin)</p>
                  <div className="w-full rounded-xl border-2 border-dashed border-blue-400/50 overflow-hidden bg-white">
                    <canvas
                      ref={canvasRef}
                      className="w-full touch-none cursor-crosshair block h-[180px]"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={endDraw}
                      onMouseLeave={endDraw}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        startDraw(e);
                      }}
                      onTouchMove={(e) => {
                        e.preventDefault();
                        draw(e);
                      }}
                      onTouchEnd={endDraw}
                    />
                  </div>
                </div>

                {err ? <p className="text-sm text-red-300">{err}</p> : null}

                <button
                  type="button"
                  disabled={saving || !kvkk || !soz}
                  onClick={() => void submit()}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-red-600 py-3.5 text-base font-bold text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
