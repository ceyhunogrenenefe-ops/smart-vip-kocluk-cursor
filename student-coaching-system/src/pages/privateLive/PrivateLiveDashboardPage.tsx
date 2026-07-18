import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Package, Users, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole, userRoleTags } from '../../config/rolePermissions';
import {
  paymentStatusClass,
  paymentStatusLabel,
  privateLiveApi,
  type PrivateLiveDashboard
} from '../../lib/privateLiveApi';

function StatCard({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

export default function PrivateLiveDashboardPage() {
  const { students } = useApp();
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isStudent =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  const canPayments = userHasAnyRole(effectiveUser, ['super_admin', 'admin', 'coach']);
  const [data, setData] = useState<PrivateLiveDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const d = await privateLiveApi().dashboard();
        if (!cancelled) setData(d);
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

  if (loading) {
    return <p className="text-sm text-slate-500">Gösterge paneli yükleniyor…</p>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {error.includes('private_live_pro_sql_missing') || error.includes('503')
          ? 'Veritabanı migrasyonu henüz uygulanmamış olabilir. SQL: 2026-07-12-private-live-pro.sql'
          : error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bugünkü ders" value={data.today.length} icon={CalendarClock} />
        <StatCard label="Yarınki ders" value={data.tomorrow.length} icon={CalendarClock} />
        {!isStudent ? (
          <StatCard label="Öğrenci" value={data.student_count} icon={Users} />
        ) : null}
        <StatCard label="Aktif paket" value={data.active_packages} icon={Package} />
        {!isStudent ? (
          <>
            <StatCard label="İptal (14 gün)" value={data.cancelled_recent} icon={AlertTriangle} />
            <StatCard label="Bekleyen telafi" value={data.pending_makeups} icon={AlertTriangle} />
          </>
        ) : null}
        {canPayments ? (
          <StatCard
            label="Yaklaşan ödemeler"
            value={data.upcoming_payments.length}
            icon={Wallet}
            hint="Ödenmedi / kısmi / gecikmiş"
          />
        ) : null}
      </div>

      {data.low_credits.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            Bitmek üzere olan paketler (kalan &lt; 5)
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
            {data.low_credits.slice(0, 8).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {e.student_name || e.package_label || 'Paket'}
                  {e.teacher_name ? ` · ${e.teacher_name}` : ''}
                </span>
                <span className="text-amber-800/80">
                  Kalan: {e.stats?.remaining_units ?? e.remaining_units ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Bugünkü dersler</h2>
            <Link to="/canli-ozel-ders/takvim" className="text-xs font-semibold text-indigo-600">
              Takvime git
            </Link>
          </div>
          {data.today.length === 0 ? (
            <p className="text-sm text-slate-500">Bugün planlı özel ders yok.</p>
          ) : (
            <ul className="space-y-2">
              {data.today.map((l) => (
                <li
                  key={String(l.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{String(l.title || 'Özel ders')}</span>
                  <span className="tabular-nums text-slate-500">
                    {String(l.start_time || '').slice(0, 5)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Yarınki dersler</h2>
          {data.tomorrow.length === 0 ? (
            <p className="text-sm text-slate-500">Yarın planlı özel ders yok.</p>
          ) : (
            <ul className="space-y-2">
              {data.tomorrow.map((l) => (
                <li
                  key={String(l.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{String(l.title || 'Özel ders')}</span>
                  <span className="tabular-nums text-slate-500">
                    {String(l.start_time || '').slice(0, 5)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {canPayments && data.upcoming_payments.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Ödeme durumu</h2>
            <Link to="/canli-ozel-ders/odemeler" className="text-xs font-semibold text-indigo-600">
              Tümü
            </Link>
          </div>
          <ul className="space-y-2">
            {data.upcoming_payments.slice(0, 6).map((e) => {
              const studentLabel =
                e.student_name ||
                students.find((s) => s.id === e.student_id)?.name ||
                'Öğrenci';
              const total = Number(e.amount_total || 0);
              const paid = Number(e.amount_paid || 0);
              const remain = Math.max(0, total - paid - Number(e.discount || 0));
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{studentLabel}</p>
                    <p className="text-xs text-slate-500">
                      {e.package_label || e.subject || 'Özel ders paketi'}
                      {e.teacher_name ? ` · ${e.teacher_name}` : ''}
                      {total > 0 ? ` · Kalan ${remain.toLocaleString('tr-TR')} ₺` : ''}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${paymentStatusClass(e.payment_status)}`}
                  >
                    {paymentStatusLabel(e.payment_status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
