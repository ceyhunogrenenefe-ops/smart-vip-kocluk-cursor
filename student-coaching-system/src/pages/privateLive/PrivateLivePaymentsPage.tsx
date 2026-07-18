import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useTeacherOptions } from '../../lib/useTeacherOptions';
import {
  paymentStatusClass,
  paymentStatusLabel,
  privateLiveApi,
  type PrivateEnrollment
} from '../../lib/privateLiveApi';

export default function PrivateLivePaymentsPage() {
  const { students } = useApp();
  const { teachers } = useTeacherOptions();
  const [rows, setRows] = useState<PrivateEnrollment[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await privateLiveApi().payments();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status && r.payment_status !== status) return false;
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      const sn = r.student_name || students.find((s) => s.id === r.student_id)?.name || '';
      const tn = r.teacher_name || teachers.find((t) => t.id === r.teacher_id)?.name || '';
      return `${sn} ${tn} ${r.package_label || ''}`.toLowerCase().includes(needle);
    });
  }, [rows, q, status, students, teachers]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Ödeme takibi yalnızca yönetici ve koçlarda görünür. Öğretmen paneline yansımaz.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
        >
          <option value="">Tüm durumlar</option>
          <option value="paid">Ödendi</option>
          <option value="partial">Kısmi</option>
          <option value="overdue">Gecikmiş</option>
          <option value="unpaid">Ödenmedi</option>
        </select>
      </div>
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Öğrenci</th>
                <th className="px-3 py-2.5">Öğretmen</th>
                <th className="px-3 py-2.5">Toplam</th>
                <th className="px-3 py-2.5">Ödenen</th>
                <th className="px-3 py-2.5">Kalan</th>
                <th className="px-3 py-2.5">Son ödeme</th>
                <th className="px-3 py-2.5">Durum</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const total = Number(r.amount_total || 0);
                const paid = Number(r.amount_paid || 0);
                const remain = Math.max(0, total - paid - Number(r.discount || 0));
                return (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-3 py-2.5 font-medium">
                      {r.student_name || students.find((s) => s.id === r.student_id)?.name || r.student_id}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.teacher_name || teachers.find((t) => t.id === r.teacher_id)?.name || r.teacher_id}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{total.toLocaleString('tr-TR')} ₺</td>
                    <td className="px-3 py-2.5 tabular-nums">{paid.toLocaleString('tr-TR')} ₺</td>
                    <td className="px-3 py-2.5 tabular-nums">{remain.toLocaleString('tr-TR')} ₺</td>
                    <td className="px-3 py-2.5">{r.due_date || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${paymentStatusClass(r.payment_status)}`}
                      >
                        {paymentStatusLabel(r.payment_status)}
                      </span>
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
