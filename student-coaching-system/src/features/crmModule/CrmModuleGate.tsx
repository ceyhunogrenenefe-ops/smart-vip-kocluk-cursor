import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { setCrmModule, useCrmModule } from './crmModule';

/**
 * CRM lisans kapısı.
 * - Online VIP Dershane: her zaman açık, hiçbir şey göstermez.
 * - Diğer kurumlar: kapalıysa kullanıcıya kilit ekranı; süper admin için açma/kapama şeridi.
 */
export default function CrmModuleGate({
  institutionId,
  institutionName,
  isSuperAdmin,
  children
}: {
  institutionId?: string | null;
  institutionName?: string | null;
  isSuperAdmin: boolean;
  children: ReactNode;
}) {
  const { enabled, loading, alwaysOn, setEnabled } = useCrmModule(institutionId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alwaysOn) return <>{children}</>;
  if (loading) return <div className="p-8 text-center text-sm text-slate-500">Yükleniyor…</div>;

  const toggle = async () => {
    if (!institutionId) return;
    setSaving(true);
    setError(null);
    try {
      const s = await setCrmModule(institutionId, !enabled);
      setEnabled(Boolean(s.enabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperAdmin && !enabled) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Lock className="mx-auto h-8 w-8 text-slate-400" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">CRM bu kurumda açık değil</h2>
        <p className="mt-2 text-sm text-slate-600">
          {institutionName ? `${institutionName} için ` : ''}CRM modülü henüz etkinleştirilmedi. Açılması için
          yöneticinizle iletişime geçin.
        </p>
      </div>
    );
  }

  return (
    <>
      {isSuperAdmin && (
        <div
          className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 text-sm ${
            enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <span>
            <strong>{institutionName || 'Bu kurum'}</strong> için CRM lisansı{' '}
            {enabled ? 'açık. Kurum kullanıcıları CRM’i kullanabiliyor.' : 'kapalı. Yalnız siz (süper admin) görüyorsunuz.'}
          </span>
          <span className="flex items-center gap-2">
            {error && <span className="text-red-700">{error}</span>}
            <button
              type="button"
              disabled={saving}
              onClick={() => void toggle()}
              className={`rounded-lg px-3 py-1 font-medium text-white disabled:opacity-60 ${
                enabled ? 'bg-slate-700 hover:bg-slate-800' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {saving ? 'Kaydediliyor…' : enabled ? 'CRM’i kapat' : 'CRM’i aç'}
            </button>
          </span>
        </div>
      )}
      {children}
    </>
  );
}
