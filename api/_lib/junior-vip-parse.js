/**
 * Junior VIP — öğrenci mesajından niyet ve alanları (ders, konu, soru sayısı, tarih, saat) çıkaran
 * kural tabanlı ayrıştırıcı. Ücretli model çağrısı yapmaz; yapılandırılmış işlemler önce buradan geçer.
 */
import { trNorm, wordsToDigits } from './junior-vip-text.js';
import { resolveDateExpression, resolveTimeExpression } from './junior-vip-dates.js';
import { cleanFreeTopic, matchSubject, matchTopic } from './junior-vip-catalog.js';

function prep(text) {
  return wordsToDigits(trNorm(text));
}

const LOG_VERB = /\b(cozdum|cozdugum|cozmustum|cozuldu|yaptim|bitirdim|tamamladim|calistim|hallettim|cozebildim|cozmusum)\b/;
const FUTURE_VERB = /\b(cozecegim|cozecem|cozicem|yapacagim|calisacagim|cozmeliyim|cozmem lazim|planla|planlar misin)\b/;
const PLAN_WORD = /\bplan(im|ima|imda|ina|imi|i|a|da)?\b|\bprogram(im|ima|ina)\b/;
const ADD_VERB = /\b(ekle|ekler misin|ekleyebilir misin|ekleyin|koy|koyar misin|yaz|yazar misin|kaydet|olustur|planla)\b/;
const LIVE_WORDS =
  /\bcanli ders|\bders program|\bdersim var|\bdersler(im|imi|imiz)\b|\bdersim\b|\bders var mi|\bhangi ders|\bozel ders|\bgrup ders|\betut(um|ler)?\b.*\b(var|ne zaman)|\bders saat/;
const NAV_VERB = /(^|\s)(ac|aç|git|gotur|goster|gec|nasil gir|nereden gir)\b/;
const CANCEL = /^(vazgec|vazgectim|iptal|bosver|bos ver|gerek yok|istemiyorum|hayir vazgec)\b/;
const NEGATIVE = /^(hayir|yok|yanlis)\b/;
const AFFIRM = /^(evet|tamam|olur|kaydet|onayliyorum|dogru|aynen|he|hı hı|tabi|tabii)\b/;

export function extractQuantity(norm) {
  const m = norm.match(/(\d{1,4})\s*(?:tane\s+|adet\s+)?(soru|test|sayfa|problem|paragraf)/);
  if (m) return { value: +m[1], unit: m[2] === 'sayfa' ? 'sayfa' : 'soru' };
  return null;
}

/** "80 değil 60", "60 olacak", "hayır 60 soru", "yanlış 60" → 60 */
export function extractCorrection(norm) {
  let m = norm.match(/(\d{1,4})\s*(?:soru\s*)?degil\s*(\d{1,4})/);
  if (m) return { from: +m[1], value: +m[2] };
  m = norm.match(/(?:hayir|yanlis|aslinda|pardon|duzelt\w*|degistir\w*)\D*?(\d{1,4})/);
  if (m) return { value: +m[1] };
  m = norm.match(/(\d{1,4})\s*(?:soru\s*)?(?:olacak|olsun|olmali|yap|olarak duzelt|olarak degistir)\b/);
  if (m) return { value: +m[1] };
  return null;
}

const TOPIC_STOP = new Set(
  (
    'bugun bugunku yarin yarinki dun aksam sabah gece ogle bu planima planina plana planim plan programima ' +
    'ekle ekler misin koy yaz kaydet lutfen soru sorusu tane adet cozdum cozecegim yaptim bitirdim calistim ' +
    'den dan ten tan konusu konusundan konudan dersi dersinden dersinden saat de da te ta icin bir birde ' +
    'ben bana benim misin mi mu musun ve ile'
  ).split(' ')
);

/** Katalogda bulunamayan konu için öğrencinin söylediği ifadeyi çıkarmaya çalışır. */
function freeTopicFrom(norm, subjectWords) {
  const words = norm
    .replace(/\d+[:.]\d+/g, ' ')
    .replace(/\d+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .filter((w) => !TOPIC_STOP.has(w))
    .filter((w) => !subjectWords.some((s) => w === s || (s.length >= 3 && w.startsWith(s))));
  // Baştaki/sondaki bağlaçları at
  while (words.length && ['ve', 'ile'].includes(words[0])) words.shift();
  while (words.length && ['ve', 'ile'].includes(words[words.length - 1])) words.pop();
  if (!words.length || words.length > 6) return null;
  const s = words.join(' ');
  return s.length >= 3 ? s : null;
}

/**
 * @param {string} text
 * @param {{ classLevel?: string|number|null, now?: Date }} opts
 */
export function parseStudentMessage(text, { classLevel = null, now = new Date() } = {}) {
  const raw = String(text || '').trim();
  const norm = prep(raw);
  const out = {
    raw,
    norm,
    intent: null,
    quantity: extractQuantity(norm),
    subject: null,
    subjectOptions: null,
    topic: null,
    topicMatched: false,
    date: null,
    dateSource: null,
    time: null,
    correction: extractCorrection(norm),
    cancel: CANCEL.test(norm),
    affirm: AFFIRM.test(norm),
    negative: NEGATIVE.test(norm)
  };

  const isLog = LOG_VERB.test(norm);
  const isFuture = FUTURE_VERB.test(norm);
  const mentionsPlan = PLAN_WORD.test(norm);
  const addVerb = ADD_VERB.test(norm);

  // Tarih (kayıt için geçmiş, plan için gelecek yönlü)
  const dir = isLog ? 'past' : 'future';
  const d = resolveDateExpression(norm, { now, direction: dir });
  if (d) {
    out.date = d.date;
    out.dateSource = d.source;
  }
  const timeText = d?.raw ? norm.replace(d.raw, ' ') : norm;
  out.time = resolveTimeExpression(timeText);
  // "aslında saat 20'de çözdüm" bir SAAT düzeltmesidir, soru sayısı değil
  if (out.correction && out.time && !/\bsoru\b|\bdegil\b/.test(norm)) out.correction = null;

  const subj = matchSubject(norm, classLevel);
  if (subj.status === 'ok') out.subject = subj.subject;
  if (subj.status === 'ambiguous') out.subjectOptions = subj.options;

  const subjectForTopic = out.subject || (out.subjectOptions ? out.subjectOptions[0] : null);
  if (subjectForTopic) {
    const tp = matchTopic(norm, subjectForTopic, classLevel);
    if (tp) {
      out.topic = tp.topic;
      out.topicMatched = true;
    }
  }

  if (LIVE_WORDS.test(norm) && !out.quantity && !isLog) {
    out.intent = 'live_lessons';
  } else if (isLog && (out.quantity || out.subject || out.subjectOptions)) {
    out.intent = 'log_study';
  } else if ((mentionsPlan && (addVerb || out.quantity)) || (addVerb && out.quantity) || (isFuture && out.quantity)) {
    out.intent = 'add_plan';
  } else if (NAV_VERB.test(norm)) {
    out.intent = 'navigate';
  } else if (out.cancel) {
    out.intent = 'cancel';
  } else if (out.correction) {
    out.intent = 'correction';
  }

  // Serbest konu: yalnız kayıt/plan niyetinde, katalogda bulunamadıysa ve ders belirlenmişse
  if (!out.topic && (out.intent === 'log_study' || out.intent === 'add_plan') && (out.subject || out.subjectOptions)) {
    const subjectWords = trNorm(`${out.subject || ''} ${(out.subjectOptions || []).join(' ')} matematik mat fen turkce`)
      .split(' ')
      .filter(Boolean);
    const free = freeTopicFrom(norm, subjectWords);
    if (free) out.topic = cleanFreeTopic(free);
  }
  return out;
}

/** Tek alanlı cevaplar ("Matematik", "Çarpanlar ve katlar", "19.00") için yardımcılar. */
export function parseSlotAnswer(slot, text, { classLevel = null, subject = null, now = new Date(), direction = 'past' } = {}) {
  const norm = prep(text);
  if (slot === 'subject') {
    const s = matchSubject(norm, classLevel);
    return s;
  }
  if (slot === 'subject_choice') {
    return matchSubject(norm, classLevel);
  }
  if (slot === 'topic') {
    const tp = subject ? matchTopic(norm, subject, classLevel) : null;
    if (tp) return { status: 'ok', topic: tp.topic, matched: true };
    const cleaned = cleanFreeTopic(String(text || '').trim().replace(/[.!?]+$/, ''));
    if (cleaned.length >= 2 && cleaned.length <= 80) return { status: 'ok', topic: cleaned, matched: false };
    return { status: 'none' };
  }
  if (slot === 'quantity') {
    const q = extractQuantity(norm);
    if (q) return { status: 'ok', value: q.value };
    const n = norm.match(/^(\d{1,4})\b/);
    if (n) return { status: 'ok', value: +n[1] };
    return { status: 'none' };
  }
  if (slot === 'time') {
    if (/\b(bilmiyorum|hatirlamiyorum|onemli degil|fark etmez|farketmez|bos ver|bosver|gec|atla|saatsiz|yok)\b/.test(norm)) {
      return { status: 'skip' };
    }
    const tm = resolveTimeExpression(norm);
    if (tm) return { status: 'ok', time: tm };
    if (/^\d{1,2}$/.test(norm) || /\bsaat\s+\d{1,2}\b/.test(norm)) return { status: 'ambiguous' };
    return { status: 'none' };
  }
  if (slot === 'date') {
    const d = resolveDateExpression(norm, { now, direction });
    return d ? { status: 'ok', date: d.date } : { status: 'none' };
  }
  return { status: 'none' };
}
