import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import {
  ACADEMIC_EXAM_ROOM_LABELS,
  DEFAULT_ACADEMIC_LINKS
} from '../api/_lib/academic-center-links-store.js';
import {
  ensureBbbMeetingAlive,
  buildBbbAttendeeJoinUrl,
  isBbbConfigured,
  isBbbAutoMeetingLink,
  resolveBbbMeetingDurationMinutes
} from '../api/_lib/bbb.js';

const VALID_ROOMS = new Set(['lise', 'yos', 'class34', 'class56', 'class78']);

function sanitizeName(raw) {
  const name = String(raw || '')
    .trim()
    .replace(/[<>"\\]/g, '')
    .slice(0, 64);
  return name || 'Öğrenci';
}

function meetingKeyPrefix(institutionId, room) {
  const inst = String(institutionId || 'platform')
    .replace(/-/g, '')
    .slice(0, 12);
  return `acad${inst}${room}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);

  const room = String(req.query?.room || req.body?.room || '').trim().toLowerCase();
  if (!VALID_ROOMS.has(room)) {
    return res.status(400).json({ error: 'invalid_room', hint: 'Geçerli oda: lise, yos, class34, class56, class78' });
  }

  if (!isBbbConfigured()) {
    return res.status(503).json({
      error: 'bbb_not_configured',
      hint: 'BBB_API_ENDPOINT ve BBB_API_SECRET tanımlı olmalı.'
    });
  }

  const institutionId = String(
    req.query?.institution_id ||
      req.body?.institution_id ||
      actor.institution_id ||
      ''
  ).trim();

  const guestName = sanitizeName(
    req.query?.name ||
      req.body?.name ||
      actor.name ||
      actor.email ||
      'Öğrenci'
  );

  const meetingName = ACADEMIC_EXAM_ROOM_LABELS[room] || DEFAULT_ACADEMIC_LINKS.exams[room] || 'Deneme Sınavı';
  const durationMinutes = resolveBbbMeetingDurationMinutes(180);
  const prefix = meetingKeyPrefix(institutionId, room);

  try {
    const ensured = await ensureBbbMeetingAlive({
      attendeeLink: isBbbAutoMeetingLink('bbb:auto') ? 'bbb:auto' : 'bbb:auto',
      moderatorLink: null,
      meetingName,
      attendeeName: guestName,
      moderatorName: 'Moderatör',
      durationMinutes,
      meetingKeyPrefix: prefix,
      storedMeetingId: null
    });

    const joinUrl = buildBbbAttendeeJoinUrl({
      meetingId: ensured.meetingId,
      attendeePassword: ensured.attendeePW,
      fullName: guestName
    });

    const redirect = String(req.query?.redirect || '').trim() === '1';
    if (redirect) {
      res.writeHead(302, { Location: joinUrl });
      return res.end();
    }

    return res.status(200).json({
      ok: true,
      url: joinUrl,
      title: meetingName,
      room,
      institution_id: institutionId || null
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg || 'bbb_join_failed' });
  }
}
