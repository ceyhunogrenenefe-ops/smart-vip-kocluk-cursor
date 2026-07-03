export type SessionBatchPeerRow = {
  id: string;
  class_id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  status: string;
  schedule_batch_id?: string | null;
};

function normalizeSessionTime(t: string): string {
  return String(t || '').slice(0, 8);
}

/** Pazartesi=1 … Pazar=7 */
export function sessionDowMon1FromIso(iso: string): number {
  const d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00');
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

export function sessionBatchSignature(session: SessionBatchPeerRow): string {
  const dow = sessionDowMon1FromIso(session.lesson_date);
  return [
    String(session.class_id || ''),
    String(session.subject || '').trim(),
    String(session.teacher_id || ''),
    normalizeSessionTime(session.start_time),
    normalizeSessionTime(session.end_time),
    String(dow)
  ].join('|');
}

/** Toplu planlanmış oturum eşleri — yalnızca aynı haftanın günü. */
export function inferSessionBatchPeers<T extends SessionBatchPeerRow>(session: T, pool: T[]): T[] {
  const scheduled = pool.filter((s) => s.status === 'scheduled');
  const anchorDow = sessionDowMon1FromIso(session.lesson_date);

  if (session.schedule_batch_id) {
    const peers = scheduled.filter(
      (s) =>
        s.schedule_batch_id === session.schedule_batch_id &&
        sessionDowMon1FromIso(s.lesson_date) === anchorDow
    );
    if (peers.length > 1) return peers;
  }

  const sig = sessionBatchSignature(session);
  const peers = scheduled.filter((s) => sessionBatchSignature(s) === sig);
  return peers.length > 1 ? peers : [session];
}
