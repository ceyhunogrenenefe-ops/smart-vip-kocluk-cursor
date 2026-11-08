/**
 * Junior VIP — öğrenci paneli konuşma motoru.
 *
 * Yapılandırılmış işler (plana ekleme, çözülen soru kaydı, canlı ders sorgusu, ekran açma) ÜCRETSİZ kural
 * motoruyla yürür; yalnız anlaşılamayan serbest mesajlar bütçeli modele gider. Model hiçbir kaydı doğrudan
 * yapamaz: döndürdüğü niyet/alanlar burada yeniden doğrulanır ve sunucu araçları çalıştırır.
 */
import { createHash } from 'node:crypto';
import { parseStudentMessage, parseSlotAnswer } from './junior-vip-parse.js';
import { matchSubject, matchTopic, cleanFreeTopic } from './junior-vip-catalog.js';
import { trKey } from './junior-vip-text.js';
import { istanbulToday, resolveDateExpression } from './junior-vip-dates.js';
import { addCalendarDaysYmd } from './istanbul-time.js';
import {
  addPlanItem,
  JuniorVipToolError,
  listLiveLessonsForDate,
  loadStudentProfile,
  logStudy,
  updateLoggedQuantity,
  updatePlannedQuantity
} from './junior-vip-tools.js';
import { signJuniorVipState, verifyJuniorVipState } from './junior-vip-state.js';
import { logJuniorVipEvent } from './junior-vip-events.js';
import { juniorVipLocalIntent } from './junior-vip-local-intent.js';
import { juniorVipAiTurn } from './junior-vip-chat.js';
import { JuniorVipBudgetError } from './junior-vip-budget.js';
import { juniorVipOpenAiKey } from './junior-vip-openai.js';

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export function formatDateTr(ymd, now = new Date()) {
  const today = istanbulToday(now);
  const [y, m, d] = String(ymd).split('-').map((x) => parseInt(x, 10));
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const base = `${d} ${MONTHS_TR[m - 1]} ${DAYS_TR[dow]}`;
  if (ymd === today) return `bugün (${base})`;
  if (ymd === addCalendarDaysYmd(today, 1)) return `yarın (${base})`;
  if (ymd === addCalendarDaysYmd(today, -1)) return `dün (${base})`;
  return base;
}

/** "MATEMATİK" → "Matematik", "TYT MATEMATİK" → "TYT Matematik" */
export function displaySubject(s) {
  return String(s || '')
    .split(' ')
    .map((w) => (/^(TYT|AYT|YÖS|LGS)$/u.test(w) ? w : w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR')))
    .join(' ');
}

/** Bulunma eki: Matematik → Matematikte, Türkçe → Türkçede, Fen Bilimleri → Fen Bilimlerinde */
function locative(word) {
  const w = String(word || '');
  const lower = w.toLocaleLowerCase('tr-TR');
  const vowels = lower.match(/[aeıioöuü]/g) || [];
  const last = vowels[vowels.length - 1] || 'e';
  const back = 'aıou'.includes(last);
  const endCh = lower.slice(-1);
  if ('aeıioöuü'.includes(endCh)) {
    // iyelik ekli bileşik ad ("Bilimleri", "Kültürü") → -nde
    if (/\s/.test(w) && /[iıuü]$/.test(lower)) return `${w}n${back ? 'da' : 'de'}`;
    return `${w}${back ? 'da' : 'de'}`;
  }
  const hard = 'fstkçşhp'.includes(endCh);
  return `${w}${hard ? 't' : 'd'}${back ? 'a' : 'e'}`;
}

function fallbackRequestKey(studentId, message, now) {
  const bucket = Math.floor(now.getTime() / 120000);
  return createHash('sha256').update(`${studentId}|${message}|${bucket}`).digest('hex').slice(0, 24);
}

// ---------------------------------------------------------------------------------------------

function newPending(kind, rk, parsed) {
  return {
    kind,
    rk,
    slots: {
      date: parsed.date || null,
      subject: parsed.subject || null,
      topic: parsed.topic || null,
      quantity: parsed.quantity?.value || null,
      time: parsed.time || null
    },
    options: parsed.subjectOptions || null,
    awaiting: null,
    asked: 0,
    timeSkipped: false,
    reask: {}
  };
}

function nextMissing(p) {
  const s = p.slots;
  if (!s.quantity) return 'quantity';
  if (!s.subject) return p.options?.length ? 'subject_choice' : 'subject';
  if (!s.topic) return 'topic';
  if (!s.date && p.kind === 'plan') return 'date';
  // Saat yalnız zaten soru-cevap içindeyken ve kayıt (geçmiş) akışında sorulur; tek cümlede tüm
  // bilgiyi veren öğrenciye yeniden soru sorulmaz. Saat zorunlu değildir, uydurulmaz.
  if (p.kind === 'log' && !s.time && p.asked > 0 && !p.timeSkipped) return 'time';
  return null;
}

function questionFor(slot, p) {
  const s = p.slots;
  const subj = displaySubject(s.subject);
  switch (slot) {
    case 'quantity':
      return p.kind === 'log' ? 'Kaç soru çözdün?' : 'Kaç soru ekleyeyim?';
    case 'subject':
      if (p.kind === 'log') return s.topic ? 'Hangi dersten çözdün?' : 'Hangi dersten ve hangi konudan çözdün?';
      return 'Hangi ders için ekleyeyim?';
    case 'subject_choice':
      return `${(p.options || []).map(displaySubject).join(' mi, ')} mi?`;
    case 'topic':
      return p.kind === 'log' ? `${locative(subj)} hangi konudan?` : `${locative(subj)} hangi konu?`;
    case 'date':
      return 'Hangi güne ekleyeyim? (bugün, yarın, pazartesi…)';
    case 'time':
      return p.kind === 'log'
        ? 'Saat kaçta çözdün? (Hatırlamıyorsan "bilmiyorum" de, saatsiz kaydederim.)'
        : 'Hangi saate koyayım? ("fark etmez" dersen boş bir saate koyarım.)';
    default:
      return '';
  }
}

/** Mesajdan çıkan ek bilgileri eksik alanlara işler (öğrenci bir cevapta birden çok bilgi verebilir). */
function mergeParsed(p, parsed) {
  const s = p.slots;
  if (!s.subject && parsed.subject) {
    s.subject = parsed.subject;
    p.options = null;
  }
  if (!s.subject && !p.options && parsed.subjectOptions) p.options = parsed.subjectOptions;
  if (!s.topic && parsed.topic && parsed.topicMatched) s.topic = parsed.topic;
  if (!s.quantity && parsed.quantity?.value) s.quantity = parsed.quantity.value;
  if (!s.time && parsed.time) s.time = parsed.time;
  if (!s.date && parsed.date) s.date = parsed.date;
}

function fillAwaiting(p, message, ctx) {
  const slot = p.awaiting;
  if (!slot) return { ok: true };
  const s = p.slots;
  const opts = { classLevel: ctx.classLevel, subject: s.subject, now: ctx.now, direction: p.kind === 'log' ? 'past' : 'future' };
  if ((slot === 'subject' || slot === 'subject_choice') && s.subject) return { ok: true };
  if (slot === 'topic' && s.topic) return { ok: true };
  if (slot === 'quantity' && s.quantity) return { ok: true };
  if (slot === 'time' && s.time) return { ok: true };
  if (slot === 'date' && s.date) return { ok: true };

  if (slot === 'subject_choice' && p.options?.length) {
    // "AYT", "ikincisi", "tyt mat" → seçeneklerden biri
    const words = trKey(message).split(' ');
    const ordinal = /\b(ilk|ilki|birinci|birincisi)\b/.test(trKey(message)) ? 0 : /\b(ikinci|ikincisi|sonraki|digeri)\b/.test(trKey(message)) ? 1 : -1;
    const pick =
      (ordinal >= 0 && p.options[ordinal]) ||
      p.options.find((o) => trKey(o) === trKey(message)) ||
      p.options.find((o) => {
        const head = trKey(o).split(' ')[0];
        return ['tyt', 'ayt', 'yos', 'maarif'].includes(head) && words.includes(head);
      });
    if (pick) {
      s.subject = pick;
      p.options = null;
      if (!s.topic) {
        const tp = matchTopic(message, pick, ctx.classLevel);
        if (tp) s.topic = tp.topic;
      }
      return { ok: true };
    }
  }
  if (slot === 'subject' || slot === 'subject_choice') {
    const r = parseSlotAnswer('subject', message, opts);
    if (r.status === 'ok') {
      s.subject = r.subject;
      p.options = null;
      if (!s.topic) {
        const tp = matchTopic(message, r.subject, ctx.classLevel);
        if (tp) s.topic = tp.topic;
      }
      return { ok: true };
    }
    if (r.status === 'ambiguous') {
      p.options = r.options;
      return { ok: true };
    }
    return { ok: false };
  }
  if (slot === 'topic') {
    const r = parseSlotAnswer('topic', message, opts);
    if (r.status === 'ok') {
      s.topic = r.topic;
      return { ok: true };
    }
    return { ok: false };
  }
  if (slot === 'quantity') {
    const r = parseSlotAnswer('quantity', message, opts);
    if (r.status === 'ok' && r.value >= 1 && r.value <= 1000) {
      s.quantity = r.value;
      return { ok: true };
    }
    return { ok: false };
  }
  if (slot === 'time') {
    const r = parseSlotAnswer('time', message, opts);
    if (r.status === 'ok') {
      s.time = r.time;
      return { ok: true };
    }
    if (r.status === 'skip') {
      p.timeSkipped = true;
      return { ok: true };
    }
    if (r.status === 'ambiguous') return { ok: false, hint: 'Sabah mı akşam mı? "19.00" gibi yazabilirsin.' };
    return { ok: false };
  }
  if (slot === 'date') {
    const r = parseSlotAnswer('date', message, opts);
    if (r.status === 'ok') {
      s.date = r.date;
      return { ok: true };
    }
    return { ok: false };
  }
  return { ok: false };
}

function slotsFromAi(ai, ctx) {
  const sl = ai.slots || {};
  const parsed = { subject: null, subjectOptions: null, topic: null, topicMatched: false, quantity: null, date: null, time: null };
  if (sl.subject) {
    const m = matchSubject(String(sl.subject), ctx.classLevel);
    if (m.status === 'ok') parsed.subject = m.subject;
    if (m.status === 'ambiguous') parsed.subjectOptions = m.options;
  }
  if (sl.topic && (parsed.subject || parsed.subjectOptions)) {
    const tp = matchTopic(String(sl.topic), parsed.subject || parsed.subjectOptions[0], ctx.classLevel);
    parsed.topic = tp ? tp.topic : cleanFreeTopic(String(sl.topic));
    parsed.topicMatched = true;
  }
  const q = Math.round(Number(sl.quantity));
  if (q >= 1 && q <= 1000) parsed.quantity = { value: q };
  if (sl.date_text) {
    const d = resolveDateExpression(String(sl.date_text), { now: ctx.now, direction: ai.intent === 'log_study' ? 'past' : 'future' });
    if (d) parsed.date = d.date;
  }
  if (typeof sl.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(sl.time)) parsed.time = sl.time;
  return parsed;
}

// ---------------------------------------------------------------------------------------------

function plannerAction(date) {
  return { type: 'navigate', path: `/weekly-planner?date=${date}`, label: 'Haftalık plan' };
}

const TOOL_ERROR_TEXT = {
  time_conflict: null,
  no_free_slot: 'O gün planında boş saat kalmadı, bu yüzden ekleyemedim. Haftalık plan ekranından düzenleyebilirsin.',
  quantity_invalid: 'Soru sayısı 1 ile 1000 arasında olmalı.',
  forbidden: 'Bu kayda erişim yetkin yok.',
  student_not_found: 'Öğrenci kaydını bulamadım.'
};

async function executePending(p, ctx) {
  const s = p.slots;
  const date = s.date || istanbulToday(ctx.now);
  s.date = date;
  const subj = displaySubject(s.subject);
  try {
    if (p.kind === 'log') {
      const r = await logStudy({
        studentId: ctx.studentId,
        institutionId: ctx.institutionId,
        date,
        subject: s.subject,
        topic: s.topic,
        solved: s.quantity,
        time: s.time,
        requestKey: p.rk
      });
      if (r.duplicate) {
        void logJuniorVipEvent({ type: 'duplicate_prevented', intent: 'log_study', panel: 'student', actorId: ctx.studentId });
      }
      const parts = [formatDateTr(date, ctx.now), `${subj} / ${s.topic}`, `${s.quantity} soru`, s.time ? `saat ${s.time}` : 'saat belirtilmedi'];
      let reply = r.duplicate
        ? `Bu çalışma zaten kayıtlıydı, ikinci kez eklemedim: ${parts.join(' · ')}.`
        : `Kaydettim ✅ ${parts.join(' · ')}.`;
      if (r.linkedToPlan && r.planner) {
        reply += ` Planındaki çalışmayla eşleştirdim (${Number(r.planner.completed_quantity) || 0}/${Number(r.planner.planned_quantity) || 0}).`;
      }
      return {
        done: true,
        reply,
        last: { kind: 'log', id: r.entry.id, quantity: s.quantity, date, subject: s.subject, topic: s.topic },
        result: {
          kind: 'study_logged',
          duplicate: r.duplicate,
          date,
          subject: s.subject,
          topic: s.topic,
          solved_questions: s.quantity,
          time: s.time || null,
          entry_id: r.entry.id,
          planner_entry_id: r.planner?.id || null,
          linked_to_plan: Boolean(r.linkedToPlan),
          // Ekranların anında güncellenmesi için öğrencinin kendi kaydı (weekly_entries satırı)
          entry: r.entry
        },
        actions: [plannerAction(date)]
      };
    }

    const r = await addPlanItem({
      studentId: ctx.studentId,
      institutionId: ctx.institutionId,
      date,
      subject: s.subject,
      topic: s.topic,
      quantity: s.quantity,
      time: s.time,
      requestKey: p.rk,
      now: ctx.now
    });
    if (r.duplicate) {
      void logJuniorVipEvent({ type: 'duplicate_prevented', intent: 'add_plan', panel: 'student', actorId: ctx.studentId });
    }
    const slotText = `${String(r.row.start_time).slice(0, 5)}–${String(r.row.end_time).slice(0, 5)}`;
    const parts = [formatDateTr(date, ctx.now), slotText, `${subj} / ${s.topic}`, `${s.quantity} soru`];
    const reply = r.duplicate
      ? `Bu çalışma planında zaten vardı, ikinci kez eklemedim: ${parts.join(' · ')}.`
      : `Planına ekledim ✅ ${parts.join(' · ')}.${s.time ? '' : ' Saat söylemediğin için o günün ilk boş saatine koydum.'}`;
    return {
      done: true,
      reply,
      last: { kind: 'plan', id: r.row.id, quantity: s.quantity, date, subject: s.subject, topic: s.topic },
      result: {
        kind: 'plan_added',
        duplicate: r.duplicate,
        date,
        subject: s.subject,
        topic: s.topic,
        planned_quantity: s.quantity,
        start_time: String(r.row.start_time).slice(0, 5),
        end_time: String(r.row.end_time).slice(0, 5),
        planner_entry_id: r.row.id
      },
      actions: [plannerAction(date)]
    };
  } catch (e) {
    const code = e instanceof JuniorVipToolError ? e.code : 'unexpected';
    void logJuniorVipEvent({
      type: 'tool_failed',
      intent: p.kind === 'log' ? 'log_study' : 'add_plan',
      code,
      panel: 'student',
      actorId: ctx.studentId
    });
    if (code === 'time_conflict') {
      const c = e.conflicting;
      s.time = null;
      p.awaiting = 'time';
      return {
        done: false,
        reply: `O saatte planında ${c ? `"${c.title}" (${c.start_time}–${c.end_time})` : 'başka bir çalışma'} var; üzerine yazmadım. Başka bir saat söyler misin? ("fark etmez" dersen boş saate koyarım.)`
      };
    }
    if (TOOL_ERROR_TEXT[code]) return { done: true, failed: true, reply: TOOL_ERROR_TEXT[code] };
    console.error('[junior-vip] tool', code, e?.message || e);
    return {
      done: false,
      failed: true,
      reply: 'Kaydı tamamlayamadım; bir sistem hatası oldu ve hiçbir şey eklendi diye varsayma. Birazdan "tekrar dene" yazarsan aynı kaydı yinelemeden yeniden denerim.'
    };
  }
}

async function applyCorrectionToLast(last, value, ctx) {
  try {
    let entry = null;
    if (last.kind === 'log') ({ entry } = await updateLoggedQuantity({ studentId: ctx.studentId, entryId: last.id, solved: value }));
    else await updatePlannedQuantity({ studentId: ctx.studentId, plannerId: last.id, quantity: value });
    void logJuniorVipEvent({ type: 'user_correction', intent: last.kind === 'log' ? 'log_study' : 'add_plan', code: 'quantity', panel: 'student', actorId: ctx.studentId });
    const subj = displaySubject(last.subject);
    return {
      reply: `Düzelttim ✅ ${formatDateTr(last.date, ctx.now)} · ${subj} / ${last.topic}: ${last.quantity} yerine ${value} soru.`,
      last: { ...last, quantity: value },
      result: { kind: last.kind === 'log' ? 'study_updated' : 'plan_updated', date: last.date, quantity: value, entry },
      actions: [plannerAction(last.date)]
    };
  } catch (e) {
    void logJuniorVipEvent({ type: 'tool_failed', intent: 'correction', code: e?.code || 'unexpected', panel: 'student', actorId: ctx.studentId });
    return { reply: 'Düzeltmeyi kaydedemedim; kayıt eski hâliyle duruyor. Birazdan tekrar dener misin?', last };
  }
}

// ---------------------------------------------------------------------------------------------

const STATUS_TR = { cancelled: 'iptal edildi', canceled: 'iptal edildi', postponed: 'ertelendi', completed: 'tamamlandı' };

export function formatLiveLessonsReply(res, ctx) {
  const when = formatDateTr(res.date, ctx.now);
  const lines = res.lessons.map((l) => {
    const time = l.end_time ? `${l.start_time}–${l.end_time}` : l.start_time;
    const what = l.kind === 'private' ? `Özel ders: ${l.title}` : `${l.title}${l.class_name ? ` (${l.class_name})` : ''}`;
    const who = l.teacher_name ? ` — ${l.teacher_name}` : '';
    const st = STATUS_TR[String(l.status || '').toLowerCase()];
    return `${time} ${what}${who}${st ? ` [${st}]` : ''}`;
  });
  const failedSources = res.failed.map((f) => (f.source === 'private' ? 'özel ders' : 'grup dersi'));
  const active = res.lessons.filter((l) => !['cancelled', 'canceled'].includes(String(l.status || '').toLowerCase()));
  if (res.failed.length && !res.lessons.length) {
    return `${when} için ders bilgisine şu an ulaşamadım (${failedSources.join(', ')} kaynağı yanıt vermedi). Bu yüzden "ders yok" diyemem; Canlı Dersler ekranını açıyorum, oradan kontrol edebilirsin.`;
  }
  let text;
  if (!res.lessons.length) text = `${when} için planlanmış canlı dersin görünmüyor.`;
  else if (!active.length) text = `${when} için derslerin iptal görünüyor: ${lines.join('; ')}.`;
  else text = `${when} ${active.length} canlı dersin var: ${lines.join('; ')}.`;
  if (res.failed.length) text += ` Not: ${failedSources.join(', ')} bilgisi şu an alınamadı, liste eksik olabilir.`;
  return text;
}

async function liveLessonsTurn(date, ctx) {
  const res = await listLiveLessonsForDate({ studentId: ctx.studentId, date });
  for (const f of res.failed) {
    void logJuniorVipEvent({ type: 'live_lessons_source_error', intent: 'live_lessons', code: f.source, panel: 'student', actorId: ctx.studentId });
  }
  const onlyPrivate = res.lessons.length && res.lessons.every((l) => l.kind === 'private');
  const path = `/class-schedule?week=${date}${onlyPrivate ? '&tab=private' : ''}`;
  return {
    reply: formatLiveLessonsReply(res, ctx),
    actions: [{ type: 'navigate', path, label: 'Canlı derslerim' }],
    result: { kind: 'live_lessons', date, ok: res.ok, lessons: res.lessons, failed_sources: res.failed.map((f) => f.source) }
  };
}

// ---------------------------------------------------------------------------------------------

/**
 * @param {{ scope: { studentId: string }, message: string, history?: object[], stateToken?: string,
 *           requestId?: string, now?: Date, buildContext?: () => Promise<object> }} args
 */
export async function juniorVipStudentTurn({ scope, message, history = [], stateToken, requestId, now = new Date(), buildContext }) {
  const studentId = scope.studentId;
  const text = String(message || '').trim();
  const state = verifyJuniorVipState(stateToken, studentId);
  const profile = await loadStudentProfile(studentId);
  const ctx = {
    studentId,
    institutionId: profile.institution_id ?? null,
    classLevel: profile.class_level ?? null,
    name: String(profile.name || '').split(/\s+/)[0] || '',
    now
  };
  const rk = String(requestId || '').trim().slice(0, 80) || fallbackRequestKey(studentId, text, now);

  const finish = (out, nextState) => ({
    reply: out.reply,
    actions: out.actions || [],
    result: out.result || null,
    refresh: out.result && ['study_logged', 'plan_added', 'study_updated', 'plan_updated'].includes(out.result.kind) ? ['weekly-planner'] : [],
    state_token: signJuniorVipState(nextState, studentId),
    proposed_study_log: null,
    meta: out.meta || { engine: 'local' }
  });

  if (!text) return finish({ reply: 'Merhaba! Bana yazabilir veya mikrofonla konuşabilirsin.' }, state);

  const parsed = parseStudentMessage(text, { classLevel: ctx.classLevel, now });
  let pending = state.pending ? { ...state.pending, slots: { ...state.pending.slots }, reask: { ...(state.pending.reask || {}) } } : null;
  let last = state.last || null;

  // 1) Vazgeç
  if (parsed.cancel && pending) {
    return finish({ reply: 'Tamam, vazgeçtim. Hiçbir şey kaydetmedim.' }, { last });
  }

  // 2) Kaydedilmiş işlemi düzeltme ("80 değil 60")
  const isNewTask = parsed.intent === 'log_study' || parsed.intent === 'add_plan';
  if (!pending && last && parsed.correction && !isNewTask) {
    const out = await applyCorrectionToLast(last, parsed.correction.value, ctx);
    return finish(out, { last: out.last });
  }

  let aiMeta = null;
  if (isNewTask) {
    // Yeni görev: önceki yarım akış (varsa) bırakılır
    pending = newPending(parsed.intent === 'log_study' ? 'log' : 'plan', rk, parsed);
  } else if (pending) {
    if (parsed.correction && pending.slots.quantity) {
      pending.slots.quantity = parsed.correction.value;
      void logJuniorVipEvent({ type: 'user_correction', intent: pending.kind === 'log' ? 'log_study' : 'add_plan', code: 'quantity_pending', panel: 'student', actorId: studentId });
    }
    const retry = /\b(tekrar dene|yeniden dene|tekrar|kaydet|evet)\b/.test(parsed.norm) && !nextMissing(pending);
    if (!retry) {
      mergeParsed(pending, parsed);
      const filled = fillAwaiting(pending, text, ctx);
      if (!filled.ok) {
        const slot = pending.awaiting;
        pending.reask[slot] = (pending.reask[slot] || 0) + 1;
        void logJuniorVipEvent({ type: 'slot_reasked', intent: pending.kind === 'log' ? 'log_study' : 'add_plan', code: slot, panel: 'student', actorId: studentId, detail: { n: pending.reask[slot] } });
        if (slot === 'time' && pending.reask[slot] >= 2) {
          pending.timeSkipped = true;
        } else if (pending.reask[slot] >= 3) {
          return finish(
            { reply: 'Bunu tam anlayamadım, o yüzden kaydı yapmadım. İstersen tek cümleyle tekrar söyle (ör. "Bugün matematik çarpanlar ve katlar 80 soru çözdüm") ya da Haftalık plan ekranından ekle.', actions: [plannerAction(istanbulToday(now))] },
            { last }
          );
        } else {
          const hint = filled.hint ? ` ${filled.hint}` : '';
          return finish({ reply: `Anlayamadım.${hint} ${questionFor(slot, pending)}`.trim() }, { pending, last });
        }
      }
    }
  } else if (parsed.intent === 'live_lessons') {
    const out = await liveLessonsTurn(parsed.date || istanbulToday(now), ctx);
    return finish(out, { last });
  } else {
    // Ücretsiz yerel yönlendirme / bugünkü özet
    const studentCtx = buildContext ? await buildContext() : { panel: 'student', student: { name: profile.name } };
    const local = juniorVipLocalIntent(text, studentCtx);
    if (local) {
      return finish({ reply: local.reply, actions: local.actions }, { last });
    }
    if (!juniorVipOpenAiKey()) {
      void logJuniorVipEvent({ type: 'intent_fallback', code: 'no_api_key', panel: 'student', actorId: studentId });
      return finish(
        {
          reply: 'Bunu anlayamadım. Şunları yapabilirim: "Bugünkü planıma matematik 40 soru ekle", "Bugün 80 soru çözdüm", "Bugün dersim var mı?" ya da "Haftalık planı aç".'
        },
        { last }
      );
    }
    try {
      const ai = await juniorVipAiTurn({ userMessage: text, ctx: studentCtx, history, panel: 'student' });
      aiMeta = ai.meta;
      if (ai.intent === 'live_lessons') {
        const out = await liveLessonsTurn(parsed.date || istanbulToday(now), ctx);
        return finish({ ...out, meta: aiMeta }, { last });
      }
      if (ai.intent === 'log_study' || ai.intent === 'add_plan') {
        void logJuniorVipEvent({ type: 'intent_fallback', intent: ai.intent, code: 'rules_missed', panel: 'student', actorId: studentId });
        const fromAi = slotsFromAi(ai, ctx);
        pending = newPending(ai.intent === 'log_study' ? 'log' : 'plan', rk, {
          ...fromAi,
          date: parsed.date || fromAi.date,
          time: parsed.time || fromAi.time
        });
      } else {
        return finish({ reply: ai.reply, actions: ai.actions, meta: aiMeta }, { last });
      }
    } catch (e) {
      if (e instanceof JuniorVipBudgetError) {
        void logJuniorVipEvent({ type: 'budget_blocked', code: e.reason, panel: 'student', actorId: studentId });
        return finish(
          {
            reply: 'Serbest sohbet bu ay için şu an kapalı. Plan ekleme ("bugünkü planıma matematik 40 soru ekle"), çalışma kaydı ("bugün 80 soru çözdüm") ve ders programı ("bugün dersim var mı?") çalışmaya devam ediyor.',
            meta: { engine: 'local', reason: 'budget', budget_reason: e.reason }
          },
          { last }
        );
      }
      void logJuniorVipEvent({ type: 'ai_error', code: 'model_failed', panel: 'student', actorId: studentId });
      return finish({ reply: 'Şu an yanıt üretemedim. Plan ekleme, çalışma kaydı ve ders programı komutlarını yine kullanabilirsin.' }, { last });
    }
  }

  // 3) Eksik alan → tek kısa soru; tamamsa kaydet
  const missing = nextMissing(pending);
  if (missing) {
    pending.awaiting = missing;
    pending.asked += 1;
    return finish({ reply: questionFor(missing, pending), meta: aiMeta || undefined }, { pending, last });
  }
  pending.awaiting = null;
  const out = await executePending(pending, ctx);
  if (out.done) {
    return finish({ ...out, meta: aiMeta || undefined }, { last: out.last || last });
  }
  return finish({ ...out, meta: aiMeta || undefined }, { pending, last });
}

