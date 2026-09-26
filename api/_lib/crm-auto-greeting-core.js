/**
 * Otomatik Karşılama — saf mantık (veritabanı / ağ yok).
 *
 * Buradaki her şey girdi → çıktı olduğu için testlenebilir: sınıf tespiti,
 * çalışma penceresi, saat aralığı seçimi, akışın bir sonraki adımı.
 * Yan etkiler (mesaj gönderme, kayıt) crm-auto-greeting.js içindedir.
 */

/** Sınıf / program seçenekleri — mesajda ve tespitte aynı liste kullanılır. */
export const GRADE_OPTIONS = [
  { key: '2', label: '2. Sınıf' },
  { key: '3', label: '3. Sınıf' },
  { key: '4', label: '4. Sınıf' },
  { key: '5', label: '5. Sınıf' },
  { key: '6', label: '6. Sınıf' },
  { key: '7', label: '7. Sınıf' },
  { key: '8', label: '8. Sınıf / LGS' },
  { key: '9', label: '9. Sınıf' },
  { key: '10', label: '10. Sınıf' },
  { key: '11', label: '11. Sınıf' },
  { key: '12', label: '12. Sınıf / YKS' },
  { key: 'mezun', label: 'Mezun / YKS' }
];

/**
 * Kademe seçimi — sınıf sorusunun ilk adımı.
 *
 * Neden iki adım: WhatsApp Cloud API bir liste mesajında toplam 10 satır kabul
 * ediyor, elimizde 12 sınıf var. Kademe → sınıf sırası hem limite sığıyor hem de
 * 12 satırlık duvardan daha okunaklı. Etiketlerde "N. Sınıf" geçmez; yoksa
 * kademe yanıtı sınıf sanılırdı.
 */
export const GRADE_LEVELS = [
  { key: 'ilkokul', label: 'İlkokul', grades: ['2', '3', '4'] },
  { key: 'ortaokul', label: 'Ortaokul', grades: ['5', '6', '7', '8'] },
  { key: 'lise', label: 'Lise / Mezun', grades: ['9', '10', '11', '12', 'mezun'] }
];

export const DEFAULT_CALL_SLOTS = [
  '10:00 - 12:00',
  '12:00 - 14:00',
  '14:00 - 16:00',
  '16:00 - 18:00',
  '18:00 - 20:00'
];

export const PREFER_MESSAGE_OPTION = 'Telefon yerine buradan bilgi almak istiyorum';

export const DEFAULT_GREETING_TEXT = `Merhabalar 👋
Online VIP Dershane ile iletişime geçtiğiniz için teşekkür ederiz.
Size en doğru bilgiyi verebilmemiz için öğrencimizin kademesini seçer misiniz?`;

export const DEFAULT_GRADE_TEXT = `Teşekkürler. Öğrencimizin sınıfını seçebilir misiniz? 👇`;

/** Sınıf seçildikten sonra ve 3 dk yanıt gelmezse gönderilen kapanış. */
export const DEFAULT_CONSULTANT_TEXT = `Teşekkür ederiz 🙏
Eğitim danışmanımız en kısa sürede sizinle iletişime geçecek.
Bu arada merak ettiğiniz bir konu varsa buraya yazabilirsiniz.`;

export const DEFAULT_CALL_TIME_TEXT = `Teşekkür ederiz. 🌟
Eğitim danışmanımız {program} programımız hakkında size detaylı bilgi verebilir.
Sizi hangi saat aralığında aramamız daha uygun olur?`;

export const DEFAULT_CLOSING_TEXT = `Teşekkür ederiz. 🙏
Bilgilerinizi eğitim danışmanımıza ilettik. Belirttiğiniz saat aralığında sizinle iletişime geçeceğiz.
Bu arada özellikle merak ettiğiniz bir konu varsa buraya yazabilirsiniz. Eğitim danışmanımız görüşme öncesinde mesajınızı da inceleyecektir.`;

/** Türkçe küçük harf, şapkasız, tek boşluklu. */
export function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[âÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .replace(/[ûÛ]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gradeLabel(key) {
  return GRADE_OPTIONS.find((g) => g.key === String(key))?.label || String(key || '');
}

export function levelLabel(key) {
  return GRADE_LEVELS.find((l) => l.key === String(key))?.label || String(key || '');
}

/** Bir kademenin sınıf seçenekleri (buton listesi için). */
export function gradeOptionsForLevel(levelKey) {
  const level = GRADE_LEVELS.find((l) => l.key === String(levelKey));
  if (!level) return [];
  return level.grades
    .map((g) => GRADE_OPTIONS.find((o) => o.key === g))
    .filter(Boolean);
}

/** Sınıf anahtarından kademe anahtarı. */
export function levelOfGrade(gradeKey) {
  const key = String(gradeKey || '');
  return GRADE_LEVELS.find((l) => l.grades.includes(key))?.key || '';
}

/**
 * Kademe seçimini çöz. Yalnız kademe etiketiyle eşleşir; "mezunum" gibi
 * serbest metin buraya değil detectGrade'e gider.
 */
export function detectGradeLevel(body) {
  const text = normalizeText(body);
  if (!text) return null;
  for (const level of GRADE_LEVELS) {
    if (text === normalizeText(level.label) || text === level.key) {
      return { key: level.key, label: level.label };
    }
  }
  // Sıra numarası ile yanıt (butonsuz kanal / numaralı metin yedeği)
  const idx = text.match(/^([1-3])$/);
  if (idx) {
    const level = GRADE_LEVELS[Number(idx[1]) - 1];
    if (level) return { key: level.key, label: level.label };
  }
  return null;
}

/**
 * Mesajdan sınıf / program çıkar. Emin olunamıyorsa null döner — tahmin edilmez.
 * @returns {{ key: string, label: string, confidence: 'high'|'medium' } | null}
 */
export function detectGrade(body) {
  const text = normalizeText(body);
  if (!text) return null;

  // "8. sınıf", "8.sinif", "8 sinif", "8inci sınıf"
  const gradeRe = /(^|[^0-9])(1[0-2]|[2-9])\s*\.?\s*(sinif|sınıf|sınıfa|sinifa|sınıfta|sinifta)/;
  const m = text.match(gradeRe);
  if (m) {
    const key = m[2];
    return { key, label: gradeLabel(key), confidence: 'high' };
  }

  // Program adları
  if (/\blgs\b/.test(text)) return { key: '8', label: gradeLabel('8'), confidence: 'high' };
  if (/\bmezun\b/.test(text)) return { key: 'mezun', label: gradeLabel('mezun'), confidence: 'high' };
  if (/\b(yks|tyt|ayt)\b/.test(text)) {
    return { key: '12', label: gradeLabel('12'), confidence: 'medium' };
  }

  // Yalnız sayı yazıldıysa (seçenek listesine cevap): "8", "12"
  const onlyNumber = text.match(/^(1[0-2]|[2-9])$/);
  if (onlyNumber) {
    const key = onlyNumber[1];
    return { key, label: gradeLabel(key), confidence: 'high' };
  }

  return null;
}

/** "hh:mm" → dakika. Geçersizse null. */
export function minutesOfDay(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Şu an otomatik karşılama çalışmalı mı?
 * @param {object} settings run_mode, business_start/end, custom_start/end
 * @param {string} nowHhmm  "HH:MM" (Istanbul)
 */
export function isWithinRunWindow(settings, nowHhmm) {
  const mode = String(settings?.run_mode || 'after_hours');
  const now = minutesOfDay(nowHhmm);
  if (now == null) return false;
  if (mode === 'always') return true;

  if (mode === 'custom_window') {
    const start = minutesOfDay(settings?.custom_start);
    const end = minutesOfDay(settings?.custom_end);
    if (start == null || end == null) return false;
    return start <= end ? now >= start && now < end : now >= start || now < end;
  }

  // after_hours: mesai saatleri DIŞINDA çalışır
  const start = minutesOfDay(settings?.business_start);
  const end = minutesOfDay(settings?.business_end);
  if (start == null || end == null) return false;
  const inBusiness = start <= end ? now >= start && now < end : now >= start || now < end;
  return !inBusiness;
}

/** Kanal bu kurumda açık mı? */
export function isChannelEnabled(settings, channel) {
  const ch = String(channel || '').toLowerCase();
  if (ch === 'whatsapp') return settings?.channel_whatsapp !== false;
  if (ch === 'instagram') return settings?.channel_instagram !== false;
  if (ch === 'facebook') return settings?.channel_facebook !== false;
  return false;
}

/** Gelen mesajdan saat aralığı seçimini çöz (metin veya sıra numarası). */
export function detectCallSlot(body, slots = DEFAULT_CALL_SLOTS) {
  const text = normalizeText(body);
  if (!text) return null;
  const list = Array.isArray(slots) && slots.length ? slots : DEFAULT_CALL_SLOTS;

  if (/(telefon|aramay|aranmak) (istemiyorum|istemem)/.test(text) || /buradan (bilgi|yaz)/.test(text)) {
    return { slot: PREFER_MESSAGE_OPTION, prefersMessage: true };
  }

  // Sıra numarası: "1", "3"
  const idx = text.match(/^([1-9])$/);
  if (idx) {
    const pos = Number(idx[1]) - 1;
    if (pos >= 0 && pos < list.length) return { slot: list[pos], prefersMessage: false };
    if (pos === list.length) return { slot: PREFER_MESSAGE_OPTION, prefersMessage: true };
  }

  // Aralığın kendisi veya başlangıç saati: "10:00 - 12:00", "10-12", "14:00"
  const digits = text.replace(/[^\d]/g, ' ').trim().split(/\s+/).filter(Boolean);
  for (const slot of list) {
    const slotDigits = String(slot).replace(/[^\d]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!slotDigits.length) continue;
    const startHour = String(Number(slotDigits[0]));
    const endHour = slotDigits.length > 2 ? String(Number(slotDigits[2])) : null;
    if (digits.length >= 2 && String(Number(digits[0])) === startHour) {
      if (!endHour || String(Number(digits[1])) === endHour || digits[1] === '00') {
        return { slot, prefersMessage: false };
      }
    }
    if (digits.length === 1 && String(Number(digits[0])) === startHour) {
      return { slot, prefersMessage: false };
    }
  }
  return null;
}

/** Seçenek listesini numaralı metne çevirir (buton desteklemeyen kanallar için). */
export function numberedOptions(options) {
  return (options || []).map((o, i) => `${i + 1}) ${typeof o === 'string' ? o : o.label}`).join('\n');
}

/**
 * Akışın bir sonraki adımı. Yan etkisiz karar fonksiyonu.
 *
 * Varsayılan akış (ask_call_slot kapalı):
 *   karşılama + kademe → sınıf → "danışmanımız iletişime geçecek"
 * Sınıf form/reklam kaydından zaten biliniyorsa hiç sorulmaz.
 * Saat aralığı sorusu ask_call_slot=true ile geri açılabilir.
 *
 * @returns {{ action: 'greet'|'ask_grade'|'ask_slot'|'complete'|'ignore',
 *             grade?: object, level?: object, slot?: object, reason?: string }}
 */
export function nextFlowAction({
  session,
  body,
  slots = DEFAULT_CALL_SLOTS,
  knownGrade = null,
  askCallSlot = false
}) {
  const step = String(session?.step || '');

  if (session?.human_takeover_at) return { action: 'ignore', reason: 'human_takeover' };
  if (step === 'completed' || step === 'stopped') return { action: 'ignore', reason: 'flow_finished' };

  /** Sınıf belliyken sorulacak bir şey kalmaz. */
  const afterGrade = (grade, reason) =>
    askCallSlot ? { action: 'ask_slot', grade, reason } : { action: 'complete', grade, reason };

  if (!session) {
    if (knownGrade?.key) {
      return afterGrade({ ...knownGrade, confidence: 'high' }, 'grade_from_lead');
    }
    const grade = detectGrade(body);
    if (grade) return afterGrade(grade, 'grade_in_first_message');
    return { action: 'greet' };
  }

  // Kademe soruldu: önce kademe etiketi, sonra doğrudan sınıf
  if (step === 'greeted' || step === 'level_asked') {
    const level = detectGradeLevel(body);
    if (level) return { action: 'ask_grade', level };
    const grade = detectGrade(body);
    if (grade) return afterGrade(grade, 'grade_typed');
    return { action: 'ignore', reason: 'waiting_level' };
  }

  if (step === 'grade_asked') {
    const grade = detectGrade(body);
    if (grade) return afterGrade(grade, 'grade_selected');
    const level = detectGradeLevel(body);
    if (level) return { action: 'ask_grade', level };
    return { action: 'ignore', reason: 'waiting_grade' };
  }

  if (step === 'slot_asked' || step === 'grade_known') {
    const slot = detectCallSlot(body, slots);
    if (slot) return { action: 'complete', slot };
    return { action: 'ignore', reason: 'waiting_slot' };
  }

  return { action: 'ignore', reason: 'unknown_step' };
}
