/**
 * Konu takibi (TopicProgress) ↔ Supabase `topic_progress` eşlemesi.
 * `topic_id`: RFC 4122 v5 — sabit namespace + (öğrenci|ders|konu) SHA-1 → 128 bit UUID.
 * `notes`: JSON meta (ders, konu, isteğe bağlı haftalık kayıt id).
 */

import type { TopicProgress } from '../types';

/** Sabit ad alanı (RFC 4122 DNS namespace örneği; yalnızca kararlı kimlik için). */
const TOPIC_PROGRESS_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export type TopicProgressNotesV1 = { v: 1; s: string; t: string; e?: string };

function uuidStringToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function u8ToUuidLower(bytes: Uint8Array): string {
  const b = new Uint8Array(bytes);
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Aynı öğrenci + ders + konu için her zaman aynı `topic_id`. */
export async function stableTopicProgressTopicId(
  studentId: string,
  subject: string,
  topic: string
): Promise<string> {
  const ns = uuidStringToBytes(TOPIC_PROGRESS_NAMESPACE);
  const name = new TextEncoder().encode(`${studentId}\n${subject}\n${topic}`);
  const input = new Uint8Array(ns.length + name.length);
  input.set(ns, 0);
  input.set(name, ns.length);
  const digest = await crypto.subtle.digest('SHA-1', input);
  const hash = new Uint8Array(digest).slice(0, 16);
  return u8ToUuidLower(hash);
}

export function topicProgressDedupeKey(studentId: string, subject: string, topic: string): string {
  return `${studentId}\u0000${subject}\u0000${topic}`;
}

export function encodeTopicProgressNotes(p: {
  subject: string;
  topic: string;
  entryId?: string;
}): string {
  const payload: TopicProgressNotesV1 = { v: 1, s: p.subject, t: p.topic };
  if (p.entryId) payload.e = p.entryId;
  return JSON.stringify(payload);
}

export function decodeTopicProgressNotes(
  notes: string | null | undefined
): { subject: string; topic: string; entryId?: string } | null {
  if (!notes?.trim()) return null;
  try {
    const o = JSON.parse(notes) as TopicProgressNotesV1;
    if (o?.v === 1 && typeof o.s === 'string' && typeof o.t === 'string') {
      return { subject: o.s, topic: o.t, entryId: typeof o.e === 'string' ? o.e : undefined };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type TopicProgressDbRow = {
  student_id: string;
  topic_id: string;
  status: string;
  notes: string | null;
  completion_date: string | null;
  updated_at: string;
  created_at: string;
};

export function topicProgressRowToApp(row: TopicProgressDbRow): TopicProgress | null {
  if (row.status !== 'completed') return null;
  const meta = decodeTopicProgressNotes(row.notes);
  if (!meta) return null;
  const completedAt =
    row.completion_date || row.updated_at || row.created_at || new Date().toISOString();
  return {
    studentId: row.student_id,
    subject: meta.subject,
    topic: meta.topic,
    completedAt,
    entryId: meta.entryId
  };
}
