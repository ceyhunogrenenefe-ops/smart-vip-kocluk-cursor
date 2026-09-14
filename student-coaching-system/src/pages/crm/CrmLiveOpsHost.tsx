import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Circle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import { crmHeartbeat, crmListPresence, crmPoll, type CrmPresenceAgent } from '../../lib/crmInboxApi';
import { notifyCrmDesktop, playCrmLeadChime } from '../../lib/crmLiveSound';

/** CRM kabuğu: heartbeat, admin online strip, yeni konuşma sesi. */
export default function CrmLiveOpsHost() {
  const { effectiveUser } = useAuth();
  const location = useLocation();
  const tags = userRoleTags(effectiveUser);
  const isAdmin = tags.includes('super_admin') || tags.includes('admin');
  const [online, setOnline] = useState<CrmPresenceAgent[]>([]);
  const pollSinceRef = useRef<string>(new Date(Date.now() - 60_000).toISOString());
  const knownConvRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const beat = () => {
      void crmHeartbeat(location.pathname).catch(() => undefined);
    };
    beat();
    const id = window.setInterval(beat, 25_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await crmListPresence(true);
        if (!cancelled) setOnline(res.data?.items || []);
      } catch {
        if (!cancelled) setOnline([]);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await crmPoll(pollSinceRef.current);
        if (cancelled) return;
        if (res.data?.server_time) pollSinceRef.current = res.data.server_time;
        const convs = res.data?.conversations || [];
        if (!primedRef.current) {
          for (const c of convs) knownConvRef.current.add(c.id);
          primedRef.current = true;
          return;
        }
        for (const c of convs) {
          if (knownConvRef.current.has(c.id)) continue;
          knownConvRef.current.add(c.id);
          playCrmLeadChime();
          notifyCrmDesktop(
            'Yeni CRM lead',
            `${c.contact_name || c.contact_identifier || 'Yeni kişi'} · ${c.channel || ''}`.trim()
          );
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!isAdmin || online.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[70] max-w-[min(100%-2rem,320px)] rounded-xl border border-emerald-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Çevrimiçi ajanlar</p>
      <ul className="mt-1 space-y-0.5">
        {online.slice(0, 8).map((a) => (
          <li key={a.user_id} className="flex items-center gap-1.5 text-xs text-slate-700">
            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
            <span className="truncate font-medium">{a.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
