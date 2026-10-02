import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Plus, Send, Trash2 } from 'lucide-react';

type Kind = { id: string; label: string; unit: string; comparable: boolean };
type Line = {
  kind: string;
  class_id: string | null;
  student_id: string | null;
  label: string;
  quantity: number | string;
  note: string;
};
type Form = {
  teacher_name: string;
  period_label: string;
  status: string;
  editable: boolean;
  submitted_at: string | null;
  lines: Array<Record<string, unknown>>;
  kinds: Kind[];
  classes: Array<{ id: string; name: string; mine: boolean }>;
  students: Array<{ id: string; name: string; class_level: string }>;
};

const bosSatir = (kind: string): Line => ({
  kind,
  class_id: null,
  student_id: null,
  label: '',
  quantity: '',
  note: ''
});

/** Öğretmenin oturum açmadan dolduracağı aylık çalışma formu. */
export default function TeacherDeclarationFormPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [form, setForm] = useState<Form | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [gonderildi, setGonderildi] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public-teacher-declaration?token=${encodeURIComponent(token)}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || 'Form açılamadı');
      setForm(j);
      setLines(
        (j.lines || []).map((l: Record<string, unknown>) => ({
          kind: String(l.kind || 'group'),
          class_id: (l.class_id as string) || null,
          student_id: (l.student_id as string) || null,
          label: String(l.label || ''),
          quantity: Number(l.quantity) || '',
          note: String(l.note || '')
        }))
      );
      if (j.status === 'submitted' && !j.editable) setGonderildi(true);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Form açılamadı');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setHata('Bağlantı eksik. Lütfen size gönderilen bağlantıyı kullanın.');
      setLoading(false);
      return;
    }
    void load();
  }, [token, load]);

  const kindsById = useMemo(() => {
    const m: Record<string, Kind> = {};
    for (const k of form?.kinds || []) m[k.id] = k;
    return m;
  }, [form]);

  const toplam = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      t[l.kind] = Math.round(((t[l.kind] || 0) + q) * 100) / 100;
    }
    return t;
  }, [lines]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const gonder = async () => {
    const dolu = lines.filter((l) => Number(l.quantity) > 0);
    if (!dolu.length) {
      setHata('En az bir çalışma satırı girmelisiniz.');
      return;
    }
    setBusy(true);
    setHata(null);
    try {
      const res = await fetch(`/api/public-teacher-declaration?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: dolu, note })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || 'Gönderilemedi');
      setGonderildi(true);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (hata && !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-700">{hata}</p>
        </div>
      </div>
    );
  }

  if (gonderildi) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm rounded-2xl border border-emerald-200 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Bildiriminiz alındı</h1>
          <p className="mt-2 text-sm text-slate-600">
            {form?.period_label} çalışma bildiriminiz kaydedildi. Teşekkür ederiz.
          </p>
          <p className="mt-4 text-xs text-slate-400">Online VIP Dershane</p>
        </div>
      </div>
    );
  }

  const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Online VIP Dershane
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Aylık Çalışma Bildirimi</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {form?.teacher_name} · <span className="font-medium">{form?.period_label}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {(form?.kinds || []).map((k) => {
          const kendi = lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === k.id);
          const ogrenciSec = k.id === 'private' || k.id === 'guidance';
          const sinifSec = k.id === 'group';
          return (
            <section key={k.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{k.label}</h2>
                {toplam[k.id] ? (
                  <span className="text-xs font-semibold text-emerald-700">
                    Toplam {toplam[k.id]} {k.unit}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 space-y-2">
                {kendi.map(({ l, i }) => (
                  <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                    <div className="flex gap-2">
                      {sinifSec ? (
                        <select
                          value={l.class_id || ''}
                          onChange={(e) => setLine(i, { class_id: e.target.value || null, label: '' })}
                          className={input}
                        >
                          <option value="">Sınıf seçin…</option>
                          {(form?.classes || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.mine ? ' ·' : ''}
                            </option>
                          ))}
                        </select>
                      ) : ogrenciSec ? (
                        <select
                          value={l.student_id || ''}
                          onChange={(e) => setLine(i, { student_id: e.target.value || null, label: '' })}
                          className={input}
                        >
                          <option value="">Öğrenci seçin…</option>
                          {(form?.students || []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={l.label}
                          onChange={(e) => setLine(i, { label: e.target.value })}
                          placeholder="Açıklama"
                          className={input}
                        />
                      )}
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        placeholder={k.unit}
                        className="w-24 shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                        className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2 text-red-600"
                        aria-label="Satırı sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {(sinifSec || ogrenciSec) && !l.class_id && !l.student_id ? (
                      <input
                        value={l.label}
                        onChange={(e) => setLine(i, { label: e.target.value })}
                        placeholder="Listede yoksa adını yazın"
                        className={`${input} mt-2`}
                      />
                    ) : null}
                    <input
                      value={l.note}
                      onChange={(e) => setLine(i, { note: e.target.value })}
                      placeholder="Açıklama (isteğe bağlı)"
                      className={`${input} mt-2`}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setLines((p) => [...p, bosSatir(k.id)])}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                {kindsById[k.id]?.label} ekle
              </button>
            </section>
          );
        })}

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="block text-sm font-semibold text-slate-900">
            Eklemek istedikleriniz
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${input} mt-2 font-normal`}
              placeholder="İsteğe bağlı"
            />
          </label>
        </section>

        {hata ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{hata}</p>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            disabled={busy}
            onClick={() => void gonder()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Bildirimi Gönder
          </button>
          <p className="mt-1.5 text-center text-[11px] text-slate-400">
            Gönderdikten sonra değişiklik için yöneticinizle görüşmeniz gerekir.
          </p>
        </div>
      </div>
    </div>
  );
}
