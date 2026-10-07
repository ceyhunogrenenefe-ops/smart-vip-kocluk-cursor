import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import {
  convertGuestToStudent,
  fetchGuestReport,
  guestSourceLabel,
  guestStatusLabel,
  setGuestStatus,
  type GuestStatus,
  type SessionGuest
} from '../lib/classSessionGuestsApi';

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_FILTERS: Array<{ id: GuestStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Tümü' },
  { id: 'suspected', label: 'Onay bekleyen' },
  { id: 'confirmed', label: 'Misafir' },
  { id: 'dismissed', label: 'Misafir değil' }
];

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'confirmed'
      ? 'bg-amber-100 text-amber-900'
      : status === 'suspected'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-slate-50 text-slate-400';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {status === 'suspected' ? '⚠ ' : ''}
      {guestStatusLabel(status)}
    </span>
  );
}

/**
 * Yönetici — Misafir Öğrenciler.
 *
 * Canlı derse kayıtlı öğrenci listesi dışından katılanlar burada toplanır.
 * Misafir sonradan kayıt yaptırırsa "Öğrenciye dönüştür" ile geçmiş katılımları
 * yeni öğrenci kaydına bağlanır; aynı kişi için iki ayrı geçmiş oluşmaz.
 */
export default function GuestStudentsPage() {
  const { students } = useApp();
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(todayIso);
  const [status, setStatus] = useState<GuestStatus | 'all'>('all');
  const [rows, setRows] = useState<SessionGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');
  /** Dönüştürme için satır başına seçilen öğrenci */
  const [hedefOgrenci, setHedefOgrenci] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setHint(null);
    try {
      const pack = await fetchGuestReport({ from, to, status });
      setRows(pack.rows);
      if (pack.hint) setHint(`Supabase SQL Editor’da \`${pack.hint}\` dosyasını çalıştırın.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste yüklenemedi');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ogrenciSecenekleri = useMemo(
    () =>
      (students || [])
        .map((s) => ({ id: String(s.id), name: String(s.name || s.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [students]
  );

  const ozet = useMemo(() => {
    let misafir = 0;
    let bekleyen = 0;
    let donusen = 0;
    const kisiler = new Set<string>();
    for (const r of rows) {
      if (String(r.status) === 'confirmed') misafir += 1;
      if (String(r.status) === 'suspected') bekleyen += 1;
      if (r.student_id) donusen += 1;
      if (String(r.status) !== 'dismissed') kisiler.add(String(r.normalized_name || ''));
    }
    return { misafir, bekleyen, donusen, kisi: kisiler.size };
  }, [rows]);

  const durumDegistir = async (row: SessionGuest, next: GuestStatus) => {
    setBusyId(row.id);
    try {
      await setGuestStatus(row.id, next);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
      toast.success('Durum güncellendi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusyId('');
    }
  };

  const ogrenciyeDonustur = async (row: SessionGuest) => {
    const studentId = hedefOgrenci[row.id] || '';
    if (!studentId) {
      toast.error('Önce hedef öğrenciyi seçin');
      return;
    }
    const ad = ogrenciSecenekleri.find((s) => s.id === studentId)?.name || 'öğrenci';
    if (
      !window.confirm(
        `“${row.display_name}” misafir kayıtları “${ad}” öğrencisine bağlanacak.\n\n` +
          'Aynı ada sahip geçmiş misafir katılımları da bu öğrenciye aktarılır. Devam edilsin mi?'
      )
    ) {
      return;
    }
    setBusyId(row.id);
    try {
      const sonuc = await convertGuestToStudent(row.id, studentId);
      toast.success(`${sonuc.linkedRows} kayıt ${ad} öğrencisine bağlandı`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dönüştürülemedi');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <Users className="h-5 w-5 text-amber-600" />
            Misafir Öğrenciler
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Canlı derse kayıtlı öğrenci listesi dışından katılanlar. Sistem eşleşmeyen adı
            “muhtemel misafir” olarak işaretler; kesin karar öğretmen ya da yönetici onayıyla
            verilir.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            Başlangıç
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            Bitiş
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            Durum
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as GuestStatus | 'all')}
              className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            Yenile
          </button>
        </div>
      </div>

      {hint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {hint}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Misafir katılım</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{ozet.misafir}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Onay bekleyen</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{ozet.bekleyen}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Farklı kişi</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{ozet.kisi}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
            Öğrenciye dönüşen
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{ozet.donusen}</p>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Seçilen tarih aralığında misafir katılımı bulunamadı.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 font-semibold">Öğrenci</th>
                <th className="px-3 py-2 font-semibold">Sınıf</th>
                <th className="px-3 py-2 font-semibold">Katıldığı Ders</th>
                <th className="px-3 py-2 font-semibold">Öğretmen</th>
                <th className="px-3 py-2 font-semibold">Tarih</th>
                <th className="px-3 py-2 font-semibold">Ders Süresi</th>
                <th className="px-3 py-2 font-semibold">Kaynak</th>
                <th className="px-3 py-2 font-semibold">Durum</th>
                <th className="px-3 py-2 font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const busy = busyId === r.id;
                const donusmus = Boolean(r.student_id);
                return (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {r.display_name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {r.is_first_visit ? 'İlk kez katılıyor' : `${r.total_guest_visits}. misafir ders`}
                        {r.minutes_present != null ? ` · ${r.minutes_present} dk derste` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.class_name || '—'}
                      {r.class_level ? (
                        <span className="block text-[10px] text-slate-400">{r.class_level}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.subject || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.teacher_name || '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                      {r.lesson_date || '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">
                      {r.start_time && r.end_time ? `${r.start_time}–${r.end_time}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {guestSourceLabel(String(r.source))}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={String(r.status)} />
                      {donusmus ? (
                        <span className="mt-0.5 block text-[10px] font-semibold text-emerald-700">
                          Öğrenci: {r.student_name || r.student_id}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {String(r.status) !== 'confirmed' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void durumDegistir(r, 'confirmed')}
                            className="rounded-lg bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                          >
                            Misafir olarak onayla
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void durumDegistir(r, 'dismissed')}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                          >
                            Misafir işaretini kaldır
                          </button>
                        )}

                        {!donusmus ? (
                          <div className="flex gap-1">
                            <select
                              value={hedefOgrenci[r.id] || ''}
                              onChange={(e) =>
                                setHedefOgrenci((prev) => ({ ...prev, [r.id]: e.target.value }))
                              }
                              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-950"
                            >
                              <option value="">Öğrenci seç…</option>
                              {ogrenciSecenekleri.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busy || !hedefOgrenci[r.id]}
                              onClick={() => void ogrenciyeDonustur(r)}
                              title="Geçmiş misafir katılımları da bu öğrenciye bağlanır"
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              <UserPlus className="h-3 w-3" />
                              Dönüştür
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
