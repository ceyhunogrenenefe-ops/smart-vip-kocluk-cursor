import React, { useState } from 'react';
import { CheckCircle2, Eye, Loader2, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  applyEdesisGroupClassSync,
  previewEdesisGroupClassSync,
  type EdesisGroupSyncItem,
  type EdesisGroupSyncPlan
} from '../../lib/edesis/edesisApi';

const ACTION_LABEL: Record<EdesisGroupSyncItem['action'], string> = {
  create: "Edesis'e eklenecek",
  move: 'Şubesi değişecek',
  link: 'Bağlantı kaydedilecek',
  ok: 'Doğru şubede',
  skip: 'Atlandı'
};
const ACTION_STYLE: Record<EdesisGroupSyncItem['action'], string> = {
  create: 'bg-emerald-50 text-emerald-700',
  move: 'bg-amber-50 text-amber-800',
  link: 'bg-sky-50 text-sky-700',
  ok: 'bg-slate-100 text-slate-600',
  skip: 'bg-rose-50 text-rose-700'
};

function roomName(r?: { name?: string; id?: string | number } | null) {
  if (!r) return '—';
  return r.name || `#${r.id}`;
}

/** 9–12 / YKS grup sınıflarını Edesis şubeleriyle eşitler: önce önizleme, sonra onayla uygula. */
export default function EdesisGroupClassSyncPanel({ disabled }: { disabled?: boolean }) {
  const [plan, setPlan] = useState<EdesisGroupSyncPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showOk, setShowOk] = useState(false);

  const preview = async () => {
    setLoading(true);
    try {
      const p = await previewEdesisGroupClassSync();
      if (!p.ok) throw new Error(p.error || 'Önizleme alınamadı');
      setPlan(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Önizleme alınamadı');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    const n = (plan.summary?.create || 0) + (plan.summary?.move || 0) + (plan.summary?.link || 0);
    if (!n) return;
    setApplying(true);
    let done = 0;
    let failed = 0;
    try {
      for (let i = 0; i < 20; i += 1) {
        const r = await applyEdesisGroupClassSync(12);
        if (!r.ok) throw new Error(r.error || 'Uygulanamadı');
        done += r.done || 0;
        failed += r.failed || 0;
        // ilerleme yoksa (hepsi hata) ya da iş bittiyse dur
        if (!r.remaining || !r.done) break;
      }
      if (failed) toast.warning(`${done} öğrenci güncellendi, ${failed} hata. Listeyi kontrol edin.`);
      else toast.success(`${done} öğrenci Edesis'te güncellendi.`);
      await preview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uygulanamadı');
    } finally {
      setApplying(false);
    }
  };

  const items = (plan?.items || []).filter((it) => showOk || it.action !== 'ok');
  const pending = (plan?.summary?.create || 0) + (plan?.summary?.move || 0) + (plan?.summary?.link || 0);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Users className="h-5 w-5 text-indigo-600" /> Grup sınıfları → Edesis şubeleri (9–12 / YKS)
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Grup derslerindeki aktif öğrencileri Edesis'te aynı sınıfın şubesine taşır; Edesis'te olmayanları ekler.
            Önce önizleme alın, değişiklikleri kontrol edip sonra uygulayın.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || loading || applying}
            onClick={() => void preview()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : plan ? <RefreshCw className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {plan ? 'Önizlemeyi yenile' : 'Önizleme al'}
          </button>
          {plan ? (
            <button
              type="button"
              disabled={disabled || applying || loading || !pending}
              onClick={() => void apply()}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {applying ? 'Uygulanıyor…' : `Uygula (${pending})`}
            </button>
          ) : null}
        </div>
      </div>

      {plan ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Hedef dönem: <strong>{plan.term?.name}</strong> · {plan.totalStudents} öğrenci ·{' '}
            {(['create', 'move', 'link', 'skip', 'ok'] as const)
              .filter((a) => plan.summary?.[a])
              .map((a) => `${ACTION_LABEL[a]}: ${plan.summary?.[a]}`)
              .join(' · ')}
          </p>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2">Platform sınıfı</th>
                  <th className="px-3 py-2">Edesis şubesi</th>
                  <th className="px-3 py-2">Öğrenci</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(plan.classes || []).map((c) => (
                  <tr key={c.classId}>
                    <td className="px-3 py-2 font-medium">{c.className}</td>
                    <td className={`px-3 py-2 ${c.room ? '' : 'font-semibold text-rose-600'}`}>
                      {c.room ? `${roomName(c.room)}${c.room.gradeName ? ` (${c.room.gradeName})` : ''}` : 'Eşleşen şube yok'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{c.studentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={showOk} onChange={(e) => setShowOk(e.target.checked)} />
            Doğru şubede olanları da göster
          </label>

          <div className="max-h-[480px] overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2">Öğrenci</th>
                  <th className="px-3 py-2">Sınıf</th>
                  <th className="px-3 py-2">Şu an (Edesis)</th>
                  <th className="px-3 py-2">Olacak</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((it) => (
                  <tr key={it.studentId}>
                    <td className="px-3 py-2 font-medium">{it.name}</td>
                    <td className="px-3 py-2 text-xs">
                      {it.className}
                      {it.alsoIn?.length ? <span className="block text-slate-400">+ {it.alsoIn.join(', ')}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {it.action === 'create'
                        ? 'Kayıtlı değil'
                        : `${roomName(it.fromRoom || (it.action === 'ok' ? it.targetRoom : null))}${it.fromTerm?.name && it.fromTerm.name !== plan.term?.name ? ` · ${it.fromTerm.name}` : ''}`}
                    </td>
                    <td className="px-3 py-2 text-xs">{roomName(it.targetRoom)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTION_STYLE[it.action]}`}>
                        {it.action === 'skip' ? 'Şube bulunamadı' : ACTION_LABEL[it.action]}
                      </span>
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      Değişiklik gerekmiyor — herkes doğru şubede.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
