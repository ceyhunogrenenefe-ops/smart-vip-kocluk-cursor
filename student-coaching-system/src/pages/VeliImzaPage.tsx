import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchVeliImzaPayload, submitVeliImza } from '../lib/parentSignApi';
import { downloadParentSignContractPdf } from '../lib/parentSignPdfDownload';
import { CheckCircle2, Download, FileText, Loader2 } from 'lucide-react';

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        setErr('Geçersiz bağlantı');
        setBusy(false);
        return;
      }
      try {
        const d = await fetchVeliImzaPayload(token);
        if (cancelled) return;
        setHtml(d.merged_html);
        setContractNo(d.contract_number);
        const done = Boolean(d.already_signed || d.signed_at);
        setSigned(done);
        setInstitutionName(String(d.institution_name || '').trim());
        setSignaturePng(d.signature_png_base64 && d.signature_png_base64.length > 80 ? d.signature_png_base64 : null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Yüklenemedi');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    if (signed) return;
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || signed) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const endDraw = () => {
    drawing.current = false;
  };

  const submit = async () => {
    if (!token || signed) return;
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-950 text-white px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-8 h-8 text-red-400" />
          <div>
            <p className="text-xs uppercase tracking-widest text-blue-300">
              {institutionName || 'Kurum'}
            </p>
            <h1 className="text-xl font-bold leading-tight">Veli onayı ve e-imza</h1>
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
            <div className="rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl overflow-hidden mb-5 max-h-[42vh] overflow-y-auto">
              <div className="p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
            </div>

            {!signed ? (
              <p className="text-xs text-slate-400 mb-3 text-center">
                Kaydı tamamladığınızda bu sayfada <strong>PDF olarak indir</strong> düğmesi görünür; imzalı sözleşmenizi
                indirebilirsiniz.
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
            ) : (
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
