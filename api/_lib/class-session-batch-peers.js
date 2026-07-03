import { supabaseAdmin } from './supabase-admin.js';
import { isoWeekdayMon1Istanbul } from './istanbul-time.js';

function normalizeSessionTimeSig(t) {
  return String(t || '').slice(0, 8);
}

export function sessionDowMon1(lessonDate) {
  return isoWeekdayMon1Istanbul(String(lessonDate || '').trim().slice(0, 10));
}

/** Aynı sınıf + ders + öğretmen + saat + haftanın günü (Pzt=1 … Paz=7). */
export function sessionBatchSignature(session) {
  const dow = sessionDowMon1(session?.lesson_date);
  return [
    String(session?.class_id || ''),
    String(session?.subject || '').trim(),
    String(session?.teacher_id || ''),
    normalizeSessionTimeSig(session?.start_time),
    normalizeSessionTimeSig(session?.end_time),
    String(dow || '')
  ].join('|');
}

function sameWeekdayPeer(anchorDate, peerDate) {
  const a = sessionDowMon1(anchorDate);
  const b = sessionDowMon1(peerDate);
  return a > 0 && b > 0 && a === b;
}

/** Toplu planlanmış planlı oturum eşleri (aynı gün + schedule_batch_id veya şablon imzası). */
export async function listScheduledSessionBatchPeers(session) {
  const selfId = String(session?.id || '').trim();
  if (String(session?.status || '') !== 'scheduled') return selfId ? [selfId] : [];

  const anchorDate = String(session.lesson_date || '').slice(0, 10);
  const batchId = session.schedule_batch_id ? String(session.schedule_batch_id).trim() : '';

  if (batchId) {
    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .select('id,lesson_date')
      .eq('schedule_batch_id', batchId)
      .eq('status', 'scheduled');
    if (error) {
      if (!/schedule_batch_id|schema cache|PGRST204/i.test(String(error.message || ''))) {
        throw error;
      }
    } else {
      const ids = (data || [])
        .filter((r) => sameWeekdayPeer(anchorDate, r.lesson_date))
        .map((r) => String(r.id))
        .filter(Boolean);
      if (ids.length) return ids.length > 1 ? ids : selfId ? [selfId] : [];
    }
  }

  const sig = sessionBatchSignature(session);
  const { data, error } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,subject,teacher_id,start_time,end_time,status,lesson_date')
    .eq('class_id', session.class_id)
    .eq('status', 'scheduled');
  if (error) throw error;
  const ids = (data || [])
    .filter((r) => sessionBatchSignature(r) === sig)
    .map((r) => String(r.id))
    .filter(Boolean);
  return ids.length > 1 ? ids : selfId ? [selfId] : [];
}
