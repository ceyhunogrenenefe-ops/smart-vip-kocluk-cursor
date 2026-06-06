import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, Loader2, Save, Users } from 'lucide-react';
import { db, QuotaSnapshot } from '../../lib/database';
import { getAuthToken } from '../../lib/session';
import { isSupabaseReady } from '../../lib/supabase';
import type { Coach } from '../../types';
import type { UserRole } from '../../context/AuthContext';

type AdminPick = { id: string; name: string; email: string };

interface QuotaManagementPanelProps {
  actorRole: UserRole;
  actorUserId: string;
  institutionId?: string;
  institutionName?: string;
  quota: QuotaSnapshot | null;
  coaches: Coach[];
  students: { coachId?: string | null }[];
  institutionAdmins: AdminPick[];
  onQuotaUpdated: () => void;
}

export function QuotaManagementPanel({
  actorRole,
  actorUserId,
  institutionId,
  institutionName,
  quota,
  coaches,
  students,
  institutionAdmins,
  onQuotaUpdated
}: QuotaManagementPanelProps) {
  const canManage =
    actorRole === 'super_admin' ||
    (actorRole === 'admin' && quota?.admin_user_id === actorUserId);

  const [adminUserId, setAdminUserId] = useState('');
  const [maxStudents, setMaxStudents] = useState('50');
  const [maxCoaches, setMaxCoaches] = useState('10');
  const [packageLabel, setPackageLabel] = useState('professional');
  const [instSaving, setInstSaving] = useState(false);
  const [instMessage, setInstMessage] = useState<string | null>(null);

  const [coachQuotaById, setCoachQuotaById] = useState<
    Record<string, { max: number | null; assigned: number }>
  >({});
  const [coachInputs, setCoachInputs] = useState<Record<string, string>>({});
  const [coachSavingId, setCoachSavingId] = useState<string | null>(null);

  const institutionCoaches = useMemo(() => {
    if (!institutionId) return coaches;
    return coaches.filter(
      (c) => !c.institutionId || String(c.institutionId) === String(institutionId)
    );
  }, [coaches, institutionId]);

  useEffect(() => {
    const fallbackAdmin =
      quota?.admin_user_id ||
      institutionAdmins[0]?.id ||
      '';
    setAdminUserId(fallbackAdmin);
    setMaxStudents(String(quota?.admin_limits?.max_students ?? 50));
    setMaxCoaches(String(quota?.admin_limits?.max_coaches ?? 10));
    setPackageLabel(quota?.admin_limits?.package_label?.trim() || 'professional');
    setInstMessage(null);
  }, [
    quota?.admin_user_id,
    quota?.admin_limits?.max_students,
    quota?.admin_limits?.max_coaches,
    quota?.admin_limits?.package_label,
    institutionAdmins
  ]);

  useEffect(() => {
    if (!canManage || !getAuthToken() || !isSupabaseReady || institutionCoaches.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextQuota: Record<string, { max: number | null; assigned: number }> = {};
      const nextInputs: Record<string, string> = {};
      for (const c of institutionCoaches) {
        try {
          const d = await db.getCoachQuota(c.id);
          nextQuota[c.id] = { max: d.max_students, assigned: d.assigned_students };
          nextInputs[c.id] =
            d.max_students != null && d.max_students >= 0 ? String(d.max_students) : '';
        } catch {
          const assigned = students.filter((s) => s.coachId === c.id).length;
          nextQuota[c.id] = { max: null, assigned };
          nextInputs[c.id] = '';
        }
      }
      if (!cancelled) {
        setCoachQuotaById(nextQuota);
        setCoachInputs(nextInputs);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, institutionCoaches, students]);

  if (!canManage || !institutionId) return null;

  const saveInstitutionQuota = async () => {
    const targetAdmin = adminUserId.trim();
    if (!targetAdmin) {
      setInstMessage('Kurum yöneticisi seçin.');
      return;
    }
    setInstSaving(true);
    setInstMessage(null);
    try {
      await db.patchAdminQuota(targetAdmin, {
        max_students: Math.max(0, Math.floor(Number(maxStudents) || 0)),
        max_coaches: Math.max(0, Math.floor(Number(maxCoaches) || 0)),
        package_label: packageLabel.trim() || 'professional'
      });
      setInstMessage('Kurum kotası kaydedildi.');
      onQuotaUpdated();
    } catch (e) {
      setInstMessage(e instanceof Error ? e.message : 'Kurum kotası kaydedilemedi.');
    } finally {
      setInstSaving(false);
    }
  };

  const saveCoachQuota = async (coachId: string) => {
    const raw = coachInputs[coachId];
    const n = Math.floor(Number(raw === '' || raw == null ? '0' : raw));
    setCoachSavingId(coachId);
    try {
      await db.patchCoachStudentQuota(coachId, Number.isFinite(n) && n >= 0 ? n : 0);
      const d = await db.getCoachQuota(coachId);
      setCoachQuotaById((p) => ({
        ...p,
        [coachId]: { max: d.max_students, assigned: d.assigned_students }
      }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Koç kotası kaydedilemedi');
    } finally {
      setCoachSavingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Gauge className="w-5 h-5 text-indigo-700 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-indigo-950">Kota yönetimi</p>
          <p className="text-sm text-indigo-900/80 mt-0.5">
            {institutionName ? `${institutionName} — ` : ''}
            kurum ve koç öğrenci limitlerini buradan güncelleyin.
          </p>
        </div>
      </div>

      {quota && (
        <div className="rounded-lg border border-indigo-100 bg-white p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-800 mb-1">Mevcut kullanım</p>
          {quota.quota_exempt ? (
            <p className="text-xs text-slate-500 mb-2">
              Ana platform kurumu — limitler bilgi amaçlı; ekleme engeli uygulanmaz.
            </p>
          ) : null}
          <p>
            Öğrenci:{' '}
            <span className="font-semibold">
              {quota.counts.students}/{quota.admin_limits?.max_students ?? '—'}
            </span>
            {quota.usage_pct?.students != null && (
              <span className="ml-2 text-slate-500">(~%{quota.usage_pct.students})</span>
            )}
          </p>
          <p className="mt-1">
            Koç:{' '}
            <span className="font-semibold">
              {quota.counts.coaches}/{quota.admin_limits?.max_coaches ?? '—'}
            </span>
            {quota.usage_pct?.coaches != null && (
              <span className="ml-2 text-slate-500">(~%{quota.usage_pct.coaches})</span>
            )}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-950">Kurum admin kotası</p>
        {actorRole === 'super_admin' && institutionAdmins.length > 1 && (
          <div>
            <label className="text-xs text-gray-600">Kurum yöneticisi</label>
            <select
              value={adminUserId}
              onChange={(e) => setAdminUserId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-lg bg-white text-sm"
            >
              {institutionAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email} ({a.email})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-600">Max öğrenci</label>
            <input
              type="number"
              min={0}
              value={maxStudents}
              onChange={(e) => setMaxStudents(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Max koç</label>
            <input
              type="number"
              min={0}
              value={maxCoaches}
              onChange={(e) => setMaxCoaches(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Paket etiketi</label>
            <input
              type="text"
              value={packageLabel}
              onChange={(e) => setPackageLabel(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded-lg bg-white"
              placeholder="professional"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={instSaving}
            onClick={() => void saveInstitutionQuota()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-700 text-white text-sm rounded-lg hover:bg-indigo-800 disabled:opacity-60"
          >
            {instSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Kurum kotasını kaydet
          </button>
          {instMessage ? (
            <span
              className={`text-sm ${instMessage.includes('kaydedildi') ? 'text-green-700' : 'text-red-700'}`}
            >
              {instMessage}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-600" />
          <p className="text-sm font-medium text-slate-800">Koç öğrenci kotası</p>
        </div>
        {institutionCoaches.length === 0 ? (
          <p className="text-sm text-gray-500">Bu kurumda koç bulunamadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">Koç</th>
                  <th className="py-2 pr-3">Atanan</th>
                  <th className="py-2 pr-3">Max öğrenci</th>
                  <th className="py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {institutionCoaches.map((coach) => {
                  const q = coachQuotaById[coach.id];
                  return (
                    <tr key={coach.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-800">{coach.name}</div>
                        <div className="text-xs text-gray-500">{coach.email}</div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {q?.assigned ?? students.filter((s) => s.coachId === coach.id).length}
                        {q?.max != null ? ` / ${q.max}` : ''}
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min={0}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg"
                          placeholder="30"
                          value={coachInputs[coach.id] ?? ''}
                          onChange={(e) =>
                            setCoachInputs((p) => ({ ...p, [coach.id]: e.target.value }))
                          }
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          disabled={coachSavingId === coach.id}
                          onClick={() => void saveCoachQuota(coach.id)}
                          className="px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-900 disabled:opacity-60"
                        >
                          {coachSavingId === coach.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                          ) : (
                            'Kaydet'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
