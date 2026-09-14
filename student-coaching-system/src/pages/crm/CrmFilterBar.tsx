import { CalendarRange, Users } from 'lucide-react';
import type { RegCoach } from '../../lib/registrationTrackingApi';

export type CrmTimePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

const PRESETS: { id: CrmTimePreset; label: string }[] = [
  { id: 'today', label: 'Bugün' },
  { id: 'yesterday', label: 'Dün' },
  { id: 'this_week', label: 'Bu Hafta' },
  { id: 'this_month', label: 'Bu Ay' },
  { id: 'custom', label: 'Tarih Aralığı' }
];

type Props = {
  preset: CrmTimePreset;
  from: string;
  to: string;
  agentId: string;
  agents: RegCoach[];
  onPreset: (p: CrmTimePreset) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onAgent: (id: string) => void;
};

export default function CrmFilterBar({
  preset,
  from,
  to,
  agentId,
  agents,
  onPreset,
  onFrom,
  onTo,
  onAgent
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <CalendarRange className="h-3.5 w-3.5" />
          Zaman
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                preset === p.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => onFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={to}
              onChange={(e) => onTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>
      <label className="block min-w-[220px]">
        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <Users className="h-3.5 w-3.5" />
          Acente / Temsilci
        </span>
        <select
          value={agentId}
          onChange={(e) => onAgent(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
        >
          <option value="">Tüm acenteler</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
