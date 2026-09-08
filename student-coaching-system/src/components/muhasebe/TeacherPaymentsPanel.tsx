import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Lock,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  Wallet
} from 'lucide-react';
import { apiFetch } from '../../lib/session';
import {
  addTeacherPayrollExtra,
  deleteTeacherPayrollExtra,
  fetchTeacherPayrollSummary,
  formatPayrollTry,
  payTeacherPayroll,
  saveTeacherPayrollDraft,
  saveTeacherPayrollRates,
  unpayTeacherPayroll,
  type PayrollTeacherCard
} from '../../lib/teacherPayrollApi';

type TeacherOption = { id: string; name: string };

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type DraftState = {
  group_units: string;
  private_units: string;
  guidance_units: string;
  group_rate: string;
  private_rate: string;
  guidance_rate: string;
  extra_label: string;
  extra_amount: string;
};

function draftFromCard(card: PayrollTeacherCard): DraftState {
  return {
    group_units: String(card.approved.group_units ?? 0),
    private_units: String(card.approved.private_units ?? 0),
    guidance_units: String(card.approved.guidance_units ?? 0),
    group_rate: String(card.rates.group_unit_price_tl ?? 500),
    private_rate: String(card.rates.private_unit_price_tl ?? 500),
    guidance_rate: String(card.rates.guidance_unit_price_tl ?? 500),
    extra_label: '',
    extra_amount: ''
  };
}

function liveTotal(draft: DraftState, extrasSum: number) {
  const g = Number(draft.group_units) || 0;
  const p = Number(draft.private_units) || 0;
  const r = Number(draft.guidance_units) || 0;
  const gr = Number(draft.group_rate) || 0;
  const pr = Number(draft.private_rate) || 0;
  const rr = Number(draft.guidance_rate) || 0;
  const gross = g * gr + p * pr + r * rr;
  return {
    gross: Math.round(gross * 100) / 100,
    extras: Math.round(extrasSum * 100) / 100,
    net: Math.round((gross + extrasSum) * 100) / 100,
    hours: Math.round(((g + p + r) * 40) / 60 * 100) / 100
  };
}

type Props = {
  onTeacherTotalChange?: (totalTry: number) => void;
};

export function TeacherPaymentsPanel({ onTeacherTotalChange }: Props) {
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [teacherId, setTeacherId] = useState('');
  const [cards, setCards] = useState<PayrollTeacherCard[]>([]);
  const [overview, setOverview] = useState<{
    total_hours: number;
    gross_tl: number;
    extras_tl: number;
    net_tl: number;
    unpaid_tl: number;
    paid_tl: number;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [view, setView] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await apiFetch('/api/users');
        const uj = await res.json().catch(() => ({}));
        if (!cancel && res.ok) {
          const rows = Array.isArray(uj.data) ? uj.data : [];
          setTeachers(
            rows
              .filter((r: { role?: string; roles?: string[] }) => {
                const roleRaw = String(r.role || '').toLowerCase();
                const roleList = Array.isArray(r.roles)
                  ? r.roles.map((x) => String(x || '').toLowerCase())
                  : [];
                return roleRaw === 'teacher' || roleList.includes('teacher');
              })
              .map((r: { id: string; name?: string; email?: string }) => ({
                id: String(r.id),
                name: String(r.name || r.email || r.id)
              }))
              .sort((a: TeacherOption, b: TeacherOption) => a.name.localeCompare(b.name, 'tr'))
          );
        }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : 'Öğretmen listesi yüklenemedi');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeacherPayrollSummary({
        from,
        to,
        teacherId: teacherId || undefined
      });
      setCards(data.teachers || []);
      setOverview(data.overview || null);
      setSchemaHint(data.schema_hint || null);
      setDrafts((prev) => {
        const next: Record<string, DraftState> = {};
        for (const card of data.teachers || []) {
          next[card.teacher_id] = prev[card.teacher_id]?.extra_label
            ? { ...draftFromCard(card), extra_label: prev[card.teacher_id].extra_label, extra_amount: prev[card.teacher_id].extra_amount }
            : draftFromCard(card);
        }
        return next;
      });
      onTeacherTotalChange?.(Number(data.overview?.unpaid_tl || data.overview?.net_tl || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hakediş yüklenemedi');
      setCards([]);
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, teacherId, onTeacherTotalChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchDraft = (tid: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => {
      const card = cards.find((c) => c.teacher_id === tid);
      const base =
        prev[tid] ||
        (card
          ? draftFromCard(card)
          : {
              group_units: '0',
              private_units: '0',
              guidance_units: '0',
              group_rate: '500',
              private_rate: '500',
              guidance_rate: '500',
              extra_label: '',
              extra_amount: ''
            });
      return { ...prev, [tid]: { ...base, ...patch } };
    });
  };

  const payloadFor = (card: PayrollTeacherCard) => {
    const d = drafts[card.teacher_id] || draftFromCard(card);
    return {
      teacher_id: card.teacher_id,
      from,
      to,
      approved_group_units: Number(d.group_units) || 0,
      approved_private_units: Number(d.private_units) || 0,
      approved_guidance_units: Number(d.guidance_units) || 0,
      group_unit_price_tl: Number(d.group_rate) || 0,
      private_unit_price_tl: Number(d.private_rate) || 0,
      guidance_unit_price_tl: Number(d.guidance_rate) || 0
    };
  };

  const onSaveDraft = async (card: PayrollTeacherCard) => {
    setBusyId(card.teacher_id);
    setNotice(null);
    setError(null);
    try {
      const d = drafts[card.teacher_id] || draftFromCard(card);
      await saveTeacherPayrollRates({
        teacher_id: card.teacher_id,
        group_unit_price_tl: Number(d.group_rate) || 0,
        private_unit_price_tl: Number(d.private_rate) || 0,
        guidance_unit_price_tl: Number(d.guidance_rate) || 0
      });
      await saveTeacherPayrollDraft(payloadFor(card));
      setNotice(`${card.teacher_name} hakediş taslağı kaydedildi.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setBusyId('');
    }
  };

  const onAddExtra = async (card: PayrollTeacherCard) => {
    const d = drafts[card.teacher_id] || draftFromCard(card);
    const label = d.extra_label.trim();
    const amount = Number(d.extra_amount);
    if (!label) {
      setError('Kalem adı gerekli');
      return;
    }
    if (!Number.isFinite(amount)) {
      setError('Geçerli tutar girin (+ veya −)');
      return;
    }
    setBusyId(card.teacher_id);
    setError(null);
    try {
      await addTeacherPayrollExtra({
        teacher_id: card.teacher_id,
        from,
        to,
        label,
        amount_tl: amount
      });
      patchDraft(card.teacher_id, { extra_label: '', extra_amount: '' });
      setNotice('Ek kalem eklendi.');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kalem eklenemedi');
    } finally {
      setBusyId('');
    }
  };

  const onDeleteExtra = async (card: PayrollTeacherCard, extraId: string) => {
    setBusyId(card.teacher_id);
    try {
      await deleteTeacherPayrollExtra(extraId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kalem silinemedi');
    } finally {
      setBusyId('');
    }
  };

  const onPay = async (card: PayrollTeacherCard) => {
    if (
      !window.confirm(
        `${card.teacher_name} için hakediş ödendi işaretlensin, kart kilitlensin ve muhasebeye Personel Gideri yazılsın mı?`
      )
    ) {
      return;
    }
    setBusyId(card.teacher_id);
    setError(null);
    try {
      await payTeacherPayroll(payloadFor(card));
      setNotice(`${card.teacher_name} ödemesi muhasebeye işlendi.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ödeme işlenemedi');
    } finally {
      setBusyId('');
    }
  };

  const onUnpay = async (card: PayrollTeacherCard) => {
    if (!window.confirm('Ödeme geri alınsın mı? Muhasebe gider kaydı da silinir.')) return;
    setBusyId(card.teacher_id);
    try {
      await unpayTeacherPayroll({ teacher_id: card.teacher_id, from, to });
      setNotice('Ödeme geri alındı; kart düzenlemeye açıldı.');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Geri alma başarısız');
    } finally {
      setBusyId('');
    }
  };

  const filteredCount = cards.length;
  const summaryLive = useMemo(() => {
    if (!cards.length) return overview;
    let gross = 0;
    let extras = 0;
    let hours = 0;
    for (const card of cards) {
      const d = drafts[card.teacher_id] || draftFromCard(card);
      const extrasSum = (card.extras || []).reduce((a, x) => a + Number(x.amount_tl || 0), 0);
      const live = liveTotal(d, extrasSum);
      gross += live.gross;
      extras += live.extras;
      hours += live.hours;
    }
    return {
      total_hours: Math.round(hours * 100) / 100,
      gross_tl: Math.round(gross * 100) / 100,
      extras_tl: Math.round(extras * 100) / 100,
      net_tl: Math.round((gross + extras) * 100) / 100,
      unpaid_tl: overview?.unpaid_tl ?? 0,
      paid_tl: overview?.paid_tl ?? 0
    };
  }, [cards, drafts, overview]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Öğretmen hakediş ödemeleri</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
            Grup, özel ve rehberlik dersleri 40 dakikalık birim üzerinden sistemden çekilir; yönetici
            sayıları ve birim ücretleri düzenleyebilir. Ödeme sonrası kart kilitlenir ve muhasebeye
            Personel Gideri yazılır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/class-live-lessons"
            className="text-sm font-semibold text-teal-700 hover:text-teal-900 whitespace-nowrap"
          >
            Canlı grup dersleri →
          </Link>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Yenile
          </button>
        </div>
      </div>

      {schemaHint ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Veritabanı şeması eksik olabilir. Supabase SQL Editor’da{' '}
          <code className="font-mono text-xs">{schemaHint}</code> dosyasını çalıştırın.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 p-4 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Öğretmen</span>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Tüm öğretmenler</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Başlangıç</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Bitiş</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setView('cards')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                view === 'cards'
                  ? 'bg-teal-700 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              Kart
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                view === 'table'
                  ? 'bg-teal-700 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Toplam Saat', value: `${summaryLive?.total_hours ?? 0} sa` },
          { label: 'Brüt Hakediş', value: formatPayrollTry(summaryLive?.gross_tl ?? 0) },
          { label: 'Ek Kalemler', value: formatPayrollTry(summaryLive?.extras_tl ?? 0) },
          { label: 'Ödenecek Net', value: formatPayrollTry(summaryLive?.net_tl ?? 0) }
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Hakediş hesaplanıyor…
        </div>
      ) : null}

      {!loading && filteredCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
          Seçili dönemde sistem kaydı veya hakediş kartı bulunamadı.
        </div>
      ) : null}

      {view === 'table' && cards.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2">Öğretmen</th>
                <th className="px-3 py-2">Grup</th>
                <th className="px-3 py-2">Özel</th>
                <th className="px-3 py-2">Rehberlik</th>
                <th className="px-3 py-2">Net</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => {
                const d = drafts[card.teacher_id] || draftFromCard(card);
                const extrasSum = (card.extras || []).reduce((a, x) => a + Number(x.amount_tl || 0), 0);
                const live = liveTotal(d, extrasSum);
                const locked = Boolean(card.settlement?.locked);
                return (
                  <tr key={card.teacher_id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium">{card.teacher_name}</td>
                    <td className="px-3 py-2">
                      {d.group_units}{' '}
                      <span className="text-xs text-slate-400">(sis: {card.system.group_units})</span>
                    </td>
                    <td className="px-3 py-2">
                      {d.private_units}{' '}
                      <span className="text-xs text-slate-400">(sis: {card.system.private_units})</span>
                    </td>
                    <td className="px-3 py-2">
                      {d.guidance_units}{' '}
                      <span className="text-xs text-slate-400">(sis: {card.system.guidance_units})</span>
                    </td>
                    <td className="px-3 py-2 font-semibold">{formatPayrollTry(live.net)}</td>
                    <td className="px-3 py-2">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          <Lock className="h-3 w-3" /> Ödendi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Ödenmedi
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {locked ? (
                        <button
                          type="button"
                          disabled={busyId === card.teacher_id}
                          onClick={() => void onUnpay(card)}
                          className="text-xs font-semibold text-slate-600 hover:underline"
                        >
                          Geri al
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === card.teacher_id}
                          onClick={() => void onPay(card)}
                          className="rounded-md bg-teal-700 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Öde
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === 'cards'
        ? cards.map((card) => {
            const d = drafts[card.teacher_id] || draftFromCard(card);
            const locked = Boolean(card.settlement?.locked);
            const extrasSum = (card.extras || []).reduce((a, x) => a + Number(x.amount_tl || 0), 0);
            const live = liveTotal(d, extrasSum);
            const busy = busyId === card.teacher_id;

            return (
              <article
                key={card.teacher_id}
                className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${
                  locked
                    ? 'border-emerald-200 dark:border-emerald-900'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{card.teacher_name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {live.hours} saat · Brüt {formatPayrollTry(live.gross)} · Net{' '}
                      {formatPayrollTry(live.net)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ödendi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        <Unlock className="h-3.5 w-3.5" /> Ödenmedi
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {(
                    [
                      {
                        key: 'group',
                        title: 'Grup Dersi',
                        system: card.system.group_units,
                        unitsKey: 'group_units' as const,
                        rateKey: 'group_rate' as const,
                        sessions: card.system.group_session_count
                      },
                      {
                        key: 'private',
                        title: 'Özel Ders',
                        system: card.system.private_units,
                        unitsKey: 'private_units' as const,
                        rateKey: 'private_rate' as const,
                        sessions: card.system.private_session_count
                      },
                      {
                        key: 'guidance',
                        title: 'Rehberlik',
                        system: card.system.guidance_units,
                        unitsKey: 'guidance_units' as const,
                        rateKey: 'guidance_rate' as const,
                        sessions: card.system.guidance_session_count
                      }
                    ] as const
                  ).map((col) => (
                    <div
                      key={col.key}
                      className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {col.title}
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <div className="text-[11px] text-slate-500">Sistem kaydı</div>
                          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                            {col.system}
                            <span className="ml-1 text-xs font-normal text-slate-400">
                              ({col.sessions} oturum)
                            </span>
                          </div>
                        </div>
                        <label className="block text-right">
                          <span className="text-[11px] text-slate-500">Onaylanan</span>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            disabled={locked}
                            value={d[col.unitsKey]}
                            onChange={(e) => patchDraft(card.teacher_id, { [col.unitsKey]: e.target.value })}
                            className="mt-0.5 w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
                          />
                        </label>
                      </div>
                      <label className="mt-2 block">
                        <span className="text-[11px] text-slate-500">Birim ücret (TL)</span>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          disabled={locked}
                          value={d[col.rateKey]}
                          onChange={(e) => patchDraft(card.teacher_id, { [col.rateKey]: e.target.value })}
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ek gelir / kesinti
                  </div>
                  <ul className="space-y-1.5">
                    {(card.extras || []).map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-sm dark:border-slate-700"
                      >
                        <span>{ex.label}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className={
                              Number(ex.amount_tl) < 0
                                ? 'font-semibold text-rose-600'
                                : 'font-semibold text-emerald-700'
                            }
                          >
                            {formatPayrollTry(ex.amount_tl)}
                          </span>
                          {!locked ? (
                            <button
                              type="button"
                              onClick={() => void onDeleteExtra(card, ex.id)}
                              className="text-slate-400 hover:text-rose-600"
                              aria-label="Kalemi sil"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!locked ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        placeholder="Kalem adı (örn. Kamp Etkinliği)"
                        value={d.extra_label}
                        onChange={(e) => patchDraft(card.teacher_id, { extra_label: e.target.value })}
                        className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                      />
                      <input
                        type="number"
                        step="1"
                        placeholder="Tutar (+/−)"
                        value={d.extra_amount}
                        onChange={(e) => patchDraft(card.teacher_id, { extra_amount: e.target.value })}
                        className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onAddExtra(card)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Ekle
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Formül: onaylanan × birim ücret + ek kalemler ={' '}
                    <strong className="text-slate-900 dark:text-white">{formatPayrollTry(live.net)}</strong>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!locked ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onSaveDraft(card)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Taslağı kaydet
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onPay(card)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                        >
                          <Wallet className="h-4 w-4" />
                          Ödeme Yap &amp; Muhasebeye İşle
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onUnpay(card)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Unlock className="h-4 w-4" /> Ödemeyi geri al
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        : null}
    </div>
  );
}

export default TeacherPaymentsPanel;
