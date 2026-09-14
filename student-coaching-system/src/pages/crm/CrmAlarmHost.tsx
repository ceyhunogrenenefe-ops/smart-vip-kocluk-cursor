import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Phone, X } from 'lucide-react';
import { rtCompleteTask, rtDueAlarms, rtSnoozeTask, type CrmOpsTask } from '../../lib/registrationTrackingApi';
import { CRM_OPS_DEMO_TASKS } from './crmOpsDemo';

const FIRED_KEY = 'crm_alarm_fired_v1';

function readFired(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeFired(set: Set<string>) {
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 420);
  } catch {
    /* autoplay / unsupported */
  }
}

export default function CrmAlarmHost() {
  const navigate = useNavigate();
  const [alarm, setAlarm] = useState<CrmOpsTask | null>(null);
  const firedRef = useRef<Set<string>>(readFired());

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await rtDueAlarms();
        const items = res.data?.items?.length ? res.data.items : [];
        const now = Date.now();
        const due = items.find((t) => {
          if (!t.due_at || t.status === 'completed') return false;
          if (firedRef.current.has(t.id)) return false;
          const ms = new Date(t.due_at).getTime();
          return ms <= now + 15_000;
        });
        if (due && !cancelled) {
          firedRef.current.add(due.id);
          writeFired(firedRef.current);
          setAlarm(due);
          playBeep();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`${due.lead_name} — takip`, { body: due.title || 'Bu kişi aranacak' });
          }
        }
      } catch {
        const demo = CRM_OPS_DEMO_TASKS.find((t) => t.status === 'pending' && t.due_at);
        if (demo && !firedRef.current.has(`shown-${demo.id}`) && !cancelled) {
          const dueAt = demo.due_at ? new Date(demo.due_at).getTime() : 0;
          if (dueAt && dueAt <= Date.now() + 120_000) {
            firedRef.current.add(`shown-${demo.id}`);
            writeFired(firedRef.current);
            setAlarm(demo);
            playBeep();
          }
        }
      }
    };

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    void tick();
    const id = window.setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!alarm) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[min(100%-1.5rem,380px)] rounded-2xl border border-amber-300 bg-white p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-800">
          <Bell className="h-5 w-5" />
          <p className="text-xs font-bold uppercase tracking-wide">Takip alarmı</p>
        </div>
        <button type="button" onClick={() => setAlarm(null)} className="rounded-lg p-1 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-base font-semibold text-slate-900">{alarm.lead_name}</p>
      <p className="text-sm text-slate-600">{alarm.lead_phone || 'Telefon yok'}</p>
      <p className="mt-1 text-sm text-slate-800">{alarm.description || alarm.title || 'Bu kişi aranacak'}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {alarm.lead_phone ? (
          <a
            href={`tel:${String(alarm.lead_phone).replace(/\s/g, '')}`}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            <Phone className="h-3 w-3" /> Şimdi ara
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => {
            navigate(`/crm?rt_lead=${alarm.lead_id}`);
            setAlarm(null);
          }}
          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
        >
          Mesaj gönder
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await rtSnoozeTask(alarm.id, 5);
            } catch {
              /* demo */
            }
            setAlarm(null);
          }}
          className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900"
        >
          5 dk ertele
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await rtCompleteTask({ task_id: alarm.id, result: 'Tamamlandı' });
            } catch {
              /* demo */
            }
            setAlarm(null);
          }}
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold"
        >
          Tamamlandı
        </button>
      </div>
    </div>
  );
}
