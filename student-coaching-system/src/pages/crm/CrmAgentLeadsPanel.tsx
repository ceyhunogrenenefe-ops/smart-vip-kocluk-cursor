import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { rtListLeads, type RegLead } from '../../lib/registrationTrackingApi';
import { GRADE_LABEL, STAGE_LABELS } from '../../lib/registrationTrackingConfig';

function dateTimeLabel(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Dashboard’da seçilen temsilciye atanmış adaylar */
export default function CrmAgentLeadsPanel({
  agentId,
  agentName,
  onClose
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<RegLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    rtListLeads({ assigned_user_id: agentId, include_lost: '1', page_size: '200', sort_by: 'updated_at' })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items || []);
        setTotal(res.total || 0);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Liste yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{agentName} · atanan adaylar</h3>
          <p className="text-[11px] text-slate-500">
            {loading ? 'Yükleniyor…' : `${total} aday${total > items.length ? ` (ilk ${items.length} gösteriliyor)` : ''}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {loading ? (
        <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-slate-400" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !items.length ? (
        <p className="text-sm text-slate-500">Bu temsilciye atanmış aday yok.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-[11px] uppercase text-slate-500">
                <th className="py-2 pr-3">Aday</th>
                <th className="py-2 pr-3">Telefon</th>
                <th className="py-2 pr-3">Sınıf</th>
                <th className="py-2 pr-3">Aşama</th>
                <th className="py-2">Son iletişim</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => navigate(`/crm?rt_lead=${encodeURIComponent(l.id)}`)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-emerald-50/60"
                  title="Pipeline’da aç"
                >
                  <td className="py-2 pr-3 font-medium text-slate-900">
                    {l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Aday'}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{l.phone || l.normalized_phone || '—'}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{GRADE_LABEL[l.grade_program] || l.grade_program}</td>
                  <td className="py-2 pr-3">
                    {l.primary_status === 'confirmed'
                      ? 'Kesin kayıt'
                      : l.primary_status === 'lost'
                        ? 'Kaybedildi'
                        : STAGE_LABELS[l.stage] || l.stage}
                  </td>
                  <td className="py-2 whitespace-nowrap text-slate-600">
                    {l.last_contact_at ? dateTimeLabel(l.last_contact_at) : <span className="text-amber-700">İletişim yok</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
