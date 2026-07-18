import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';
import {
  paymentStatusClass,
  paymentStatusLabel,
  privateLiveApi,
  type PrivateEnrollment
} from '../../lib/privateLiveApi';

export default function PrivateLiveReportsPage() {
  const { students } = useApp();
  const { effectiveUser } = useAuth();
  const canPayments = userHasAnyRole(effectiveUser, ['super_admin', 'admin', 'coach']);
  const [data, setData] = useState<{
    total_enrollments?: number;
    total_completed?: number;
    total_remaining?: number;
    total_absent?: number;
    payment_breakdown?: Record<string, number> | null;
    enrollments?: PrivateEnrollment[];
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await privateLiveApi().reports();
        if (!cancelled) setData(d as typeof data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Yüklenemedi');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
        {error}
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-500">Rapor hazırlanıyor…</p>;

  const completed = data.total_completed || 0;
  const absent = data.total_absent || 0;
  const successRate =
    completed + absent > 0 ? Math.round((completed / (completed + absent)) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Toplam kayıt</p>
          <p className="text-2xl font-bold">{data.total_enrollments ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Tamamlanan</p>
          <p className="text-2xl font-bold">{completed}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Kalan ders</p>
          <p className="text-2xl font-bold">{data.total_remaining ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Başarı oranı</p>
          <p className="text-2xl font-bold">{successRate != null ? `%${successRate}` : '—'}</p>
          <p className="text-[11px] text-slate-500">Devamsızlık: {absent}</p>
        </div>
      </div>

      {canPayments && data.payment_breakdown ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Ödeme durumu dağılımı</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.payment_breakdown).map(([k, v]) => (
              <span
                key={k}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${paymentStatusClass(k)}`}
              >
                {paymentStatusLabel(k)}: {v}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Öğrenci</th>
              <th className="px-3 py-2.5">Tamamlanan</th>
              <th className="px-3 py-2.5">Kalan</th>
              <th className="px-3 py-2.5">Devamsızlık</th>
              {canPayments ? <th className="px-3 py-2.5">Ödeme</th> : null}
            </tr>
          </thead>
          <tbody>
            {(data.enrollments || []).map((e) => (
              <tr key={e.id} className="border-b border-slate-50">
                <td className="px-3 py-2.5 font-medium">
                  {e.student_name || students.find((s) => s.id === e.student_id)?.name || e.student_id}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{e.stats?.completed ?? 0}</td>
                <td className="px-3 py-2.5 tabular-nums">{e.stats?.remaining_units ?? '∞'}</td>
                <td className="px-3 py-2.5 tabular-nums">{e.stats?.absent ?? 0}</td>
                {canPayments ? (
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${paymentStatusClass(e.payment_status)}`}
                    >
                      {paymentStatusLabel(e.payment_status)}
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
