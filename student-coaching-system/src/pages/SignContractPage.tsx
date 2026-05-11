import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSigningPayload, submitSignature } from '../lib/contractSystemApi';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';

export default function SignContractPage() {
  const { token } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [html, setHtml] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        setErr('Geçersiz bağlantı');
        setBusy(false);
        return;
      }
      try {
        const d = await fetchSigningPayload(token);
        if (cancelled) return;
        setHtml(d.merged_html);
        setContractNo(d.contract_number);
        setSigned(d.already_signed);
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
    c.height = 160;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2;
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
    if (!token || !accepted || signed) return;
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
      await submitSignature({ signing_token: token, signature_png_base64: png, accepted_terms: true });
      setSigned(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-slate-900 to-slate-950 text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-8 h-8 text-red-400" />
          <div>
            <p className="text-xs uppercase tracking-widest text-blue-300">Smart Koçluk</p>
            <h1 className="text-xl font-bold">Dijital sözleşme imzası</h1>
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
            <div className="rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl overflow-hidden mb-6">
              <div className="max-h-[50vh] overflow-y-auto p-4 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
            </div>

            {signed ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 flex items-center gap-2 text-emerald-100">
                <CheckCircle2 className="w-6 h-6" />
                İmza kaydedildi. Teşekkür ederiz.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-4">
                <p className="text-sm text-slate-200">Aşağıdaki kutuda imzanızı çizin (parmak veya fare).</p>
                <div className="w-full rounded-xl border border-white/20 overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    className="w-full touch-none cursor-crosshair block"
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
                <label className="flex items-start gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
                  Metni okudum, onaylıyorum ve elektronik imzamın hukuki sonuç doğuracağını kabul ediyorum.
                </label>
                {err ? <p className="text-sm text-red-300">{err}</p> : null}
                <button
                  type="button"
                  disabled={saving || !accepted}
                  onClick={() => void submit()}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-red-600 py-3 font-semibold disabled:opacity-40"
                >
                  {saving ? 'Kaydediliyor…' : 'İmzayı gönder'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
