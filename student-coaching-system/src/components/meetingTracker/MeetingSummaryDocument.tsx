import type { MtAgendaItem, MtMeetingBundle, MtTask, MtUser } from '../../lib/meetingTrackerApi';

const AGENDA_STATUS: Record<string, string> = {
  pending: 'Görüşülecek',
  in_discussion: 'Görüşülüyor',
  discussed: 'Görüşüldü',
  deferred: 'Ertelendi',
  cancelled: 'İptal'
};

const TASK_STATUS: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam',
  done: 'Tamam',
  overdue: 'Gecikti',
  deferred: 'Ertelendi',
  cancelled: 'İptal'
};

const MEETING_STATUS: Record<string, string> = {
  draft: 'Taslak',
  planned: 'Planlandı',
  held: 'Gerçekleşti',
  closed: 'Kapatıldı',
  cancelled: 'İptal'
};

type Props = {
  bundle: MtMeetingBundle;
  users: MtUser[];
  userName: (id?: string | null) => string;
};

function assigneeNames(task: MtTask, users: MtUser[]) {
  const ids = (task.assignees || task.mt_task_assignees || []).map((a) => a.user_id);
  return ids
    .map((id) => users.find((u) => u.id === id)?.name || users.find((u) => u.id === id)?.email || '—')
    .join(', ');
}

export default function MeetingSummaryDocument({ bundle, users, userName }: Props) {
  const m = bundle.meeting;
  const discussed = bundle.agenda.filter((a) => a.status === 'discussed').length;
  const openTasks = bundle.tasks.filter((t) => !['done', 'cancelled'].includes(t.status)).length;

  return (
    <div
      className="meeting-summary-pdf bg-white text-slate-900"
      style={{ width: 794, minHeight: 1123, padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 55%, #6366f1 100%)',
          borderRadius: 16,
          padding: '28px 32px',
          color: '#fff',
          marginBottom: 28
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.85 }}>
          Toplantı Özeti
        </div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 26, fontWeight: 700, lineHeight: 1.25 }}>{m.title}</h1>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.92 }}>
          {bundle.type?.name || '—'} · {m.meeting_date}
          {m.start_time ? ` · ${String(m.start_time).slice(0, 5)}` : ''}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.88 }}>
          Yönetici: {userName(m.manager_user_id)} · Durum: {MEETING_STATUS[m.status] || m.status}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Gündem', value: bundle.agenda.length },
          { label: 'Görüşülen', value: discussed },
          { label: 'Açık görev', value: openTasks },
          { label: 'Karar', value: bundle.agenda.filter((a) => a.decision_text?.trim()).length }
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px 14px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: '#4f46e5' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 20 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '10px 8px', textAlign: 'left', width: 28, borderBottom: '2px solid #cbd5e1' }}>#</th>
            <th style={{ padding: '10px 8px', textAlign: 'left', width: '28%', borderBottom: '2px solid #cbd5e1' }}>Gündem</th>
            <th style={{ padding: '10px 8px', textAlign: 'left', width: '32%', borderBottom: '2px solid #cbd5e1' }}>Alınan karar</th>
            <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Yapılacaklar & sorumlular</th>
          </tr>
        </thead>
        <tbody>
          {bundle.agenda.map((item: MtAgendaItem, idx) => {
            const rowTasks = bundle.tasks.filter((t) => t.agenda_item_id === item.id);
            return (
              <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{idx + 1}</td>
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  {item.description && (
                    <div style={{ color: '#64748b', marginTop: 4, fontSize: 10 }}>{item.description}</div>
                  )}
                  <div style={{ marginTop: 6, fontSize: 10, color: '#6366f1' }}>
                    {AGENDA_STATUS[item.status] || item.status}
                  </div>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {item.decision_text?.trim() ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{item.decision_text}</span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 8px' }}>
                  {rowTasks.length ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {rowTasks.map((t) => (
                        <li key={t.id} style={{ marginBottom: 6 }}>
                          <strong>{t.title}</strong>
                          <div style={{ color: '#64748b', fontSize: 10 }}>
                            {TASK_STATUS[t.status] || t.status}
                            {t.due_date ? ` · Son: ${t.due_date}` : ''}
                            {assigneeNames(t, users) ? ` · ${assigneeNames(t, users)}` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {bundle.notes.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#334155' }}>Toplantı notları</h2>
          {bundle.notes.slice(0, 8).map((n) => (
            <div
              key={n.id}
              style={{
                borderLeft: '3px solid #818cf8',
                padding: '8px 12px',
                marginBottom: 8,
                background: '#f8fafc',
                fontSize: 11
              }}
            >
              <div style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>
                {userName(n.created_by)} · {new Date(n.created_at).toLocaleString('tr-TR')}
              </div>
              {n.body}
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop: 32, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8' }}>
        Online VIP Dershane · Toplantı özeti · {new Date().toLocaleString('tr-TR')}
      </div>
    </div>
  );
}
