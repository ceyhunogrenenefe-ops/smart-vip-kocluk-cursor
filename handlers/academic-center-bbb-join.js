import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { createAcademicStudyGuestJoinShareLink } from '../api/_lib/bbb-guest-join-core.js';
import {
  ACADEMIC_EXAM_ROOM_LABELS,
  ACADEMIC_STUDY_ROOM_LABELS,
  DEFAULT_ACADEMIC_LINKS
} from '../api/_lib/academic-center-links-store.js';
import {
  ensureBbbMeetingAlive,
  buildBbbAttendeeJoinUrl,
  isBbbConfigured,
  isBbbAutoMeetingLink,
  resolveBbbMeetingDurationMinutes,
  bbbStudentEtutReportLogoutUrl,
  bbbTeacherPostLessonLogoutUrl
} from '../api/_lib/bbb.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const VALID_EXAM_ROOMS = new Set(['lise', 'yos', 'class34', 'class56', 'class78']);
const VALID_STUDY_ROOMS = new Set(['class56', 'class78', 'class911', 'yks']);

function sanitizeName(raw) {
  const name = String(raw || '')
    .trim()
    .replace(/[<>"\\]/g, '')
    .slice(0, 64);
  return name || 'Öğrenci';
}

function meetingKeyPrefix(institutionId, room, kind) {
  const inst = String(institutionId || 'platform')
    .replace(/-/g, '')
    .slice(0, 12);
  const tag = kind === 'study' ? 'etut' : 'acad';
  return `${tag}${inst}${room}`;
}

function resolveKind(raw) {
  const k = String(raw || 'exam').trim().toLowerCase();
  return k === 'study' ? 'study' : 'exam';
}

function resolveInstitutionScope(actor, requestedId) {
  const role = String(actor.role || '').trim();
  const req = String(requestedId || '').trim();
  if (role === 'super_admin') return req;
  const own = String(actor.institution_id || '').trim();
  if (role === 'admin') return own || req;
  return own || req;
}

async function handleAcademicStudyGuestJoinLink(req, res, actor) {
  const role = String(actor.role || '').trim();
  if (role === 'student') return res.status(403).json({ error: 'Yetkiniz yok' });

  const room = String(req.query?.room || '').trim().toLowerCase();
  if (!VALID_STUDY_ROOMS.has(room)) {
    return res.status(400).json({ error: 'Geçersiz etüt sınıfı.' });
  }

  const institutionId = resolveInstitutionScope(
    actor,
    req.query?.institution_id || actor.institution_id || ''
  );

  try {
    const link = await createAcademicStudyGuestJoinShareLink({ institutionId, room });
    return res.status(200).json({ ok: true, ...link });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(400).json({ error: msg || 'guest_join_link_failed' });
  }
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

  const op = String(req.query?.op || req.body?.op || '').trim();
  if (op === 'guest-join-link') {
    return handleAcademicStudyGuestJoinLink(req, res, actor);
  }

  const kind = resolveKind(req.query?.kind || req.body?.kind);
  const room = String(req.query?.room || req.body?.room || '').trim().toLowerCase();
  const validRooms = kind === 'study' ? VALID_STUDY_ROOMS : VALID_EXAM_ROOMS;
  if (!validRooms.has(room)) {
    return res.status(400).json({
      error: 'invalid_room',
      hint:
        kind === 'study'
          ? 'Geçerli etüt oda: class56, class78, class911, yks'
          : 'Geçerli deneme oda: lise, yos, class34, class56, class78'
    });
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

  const meetingName =
    kind === 'study'
      ? ACADEMIC_STUDY_ROOM_LABELS[room] ||
        DEFAULT_ACADEMIC_LINKS.studyClasses[room] ||
        'Etüt Sınıfı'
      : ACADEMIC_EXAM_ROOM_LABELS[room] ||
        DEFAULT_ACADEMIC_LINKS.exams[room] ||
        'Deneme Sınavı';
  const durationMinutes = resolveBbbMeetingDurationMinutes(180);
  const prefix = meetingKeyPrefix(institutionId, room, kind);

  try {
    const ensured = await ensureBbbMeetingAlive({
      attendeeLink: isBbbAutoMeetingLink('bbb:auto') ? 'bbb:auto' : 'bbb:auto',
      moderatorLink: null,
      meetingName,
      attendeeName: guestName,
      moderatorName: 'Moderatör',
      durationMinutes,
      meetingKeyPrefix: prefix,
      storedMeetingId: null,
      logoutUrl:
        kind === 'study'
          ? bbbStudentEtutReportLogoutUrl()
          : bbbTeacherPostLessonLogoutUrl()
    });

    const joinUrl = buildBbbAttendeeJoinUrl({
      meetingId: ensured.meetingId,
      attendeePassword: ensured.attendeePW,
      fullName: guestName
    });

    // Öğrenci deneme/etüt giriş logu (koç istatistikleri) — join'i engellemez
    void (async () => {
      try {
        const studentId = String(actor.student_id || '').trim() || null;
        if (String(actor.role || '') !== 'student' && !studentId) return;
        const { error: logErr } = await supabaseAdmin.from('academic_deneme_join_logs').insert({
          student_id: studentId,
          user_id: actor.sub || null,
          institution_id: institutionId || actor.institution_id || null,
          room,
          kind,
          meeting_id: ensured.meetingId || null,
          display_name: guestName,
          istanbul_date: getIstanbulDateString()
        });
        if (logErr && !isMissingTableError(logErr, 'academic_deneme_join_logs')) {
          console.warn('[academic-center-bbb-join] log:', errorMessage(logErr));
        }
      } catch (logE) {
        console.warn('[academic-center-bbb-join] log:', errorMessage(logE));
      }
    })();

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
      kind,
      institution_id: institutionId || null
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg || 'bbb_join_failed' });
  }
}
