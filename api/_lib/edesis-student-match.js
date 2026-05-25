import {
  normalizePersonName,
  normalizeEmail,
  nameLookupKeys,
  studentMatchKeysFromEdesisRow
} from './edesis-client.js';

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

function phoneTail10(s) {
  const d = digits(s);
  return d.length >= 10 ? d.slice(-10) : d;
}

function buildStudentIndex(students) {
  const byEdesisId = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  const byParentPhone = new Map();
  const byNameKey = new Map();
  const nameTokenIndex = [];

  for (const s of students) {
    const edesisId = s.edesis_ogrenci_id != null ? String(s.edesis_ogrenci_id).trim() : '';
    if (edesisId) byEdesisId.set(edesisId, s.id);

    const email = normalizeEmail(s.email);
    if (email) byEmail.set(email, s.id);

    const ph = phoneTail10(s.phone);
    if (ph.length >= 10) byPhone.set(ph, s.id);

    const pph = phoneTail10(s.parent_phone);
    if (pph.length >= 10) byParentPhone.set(pph, s.id);

    for (const key of nameLookupKeys(s.name)) {
      if (!byNameKey.has(key)) byNameKey.set(key, s.id);
    }

    const tokens = normalizePersonName(s.name)
      .split(' ')
      .filter((t) => t.length > 1);
    if (tokens.length) nameTokenIndex.push({ id: s.id, tokens: new Set(tokens) });
  }

  return { byEdesisId, byEmail, byPhone, byParentPhone, byNameKey, nameTokenIndex, students };
}

function matchByNameKeys(keys, index) {
  for (const key of nameLookupKeys(keys.name)) {
    if (index.byNameKey.has(key)) {
      return { studentId: index.byNameKey.get(key), method: 'name' };
    }
  }

  const tokens = normalizePersonName(keys.name)
    .split(' ')
    .filter((t) => t.length > 1);
  if (tokens.length < 2) return { studentId: null, method: null };

  const hits = [];
  for (const entry of index.nameTokenIndex) {
    const ok = tokens.every((t) => entry.tokens.has(t));
    if (ok) hits.push(entry.id);
  }
  const unique = [...new Set(hits)];
  if (unique.length === 1) {
    return { studentId: unique[0], method: 'name_tokens' };
  }

  return { studentId: null, method: null };
}

/**
 * Edesis satırı → Smart Koçluk students.id
 * Öncelik: edesis_ogrenci_id → e-posta → ad → telefon → veli telefonu
 */
export function resolveStudentIdFromEdesis(keys, index, runtimeMap) {
  if (keys.edesisStudentId) {
    if (index.byEdesisId.has(keys.edesisStudentId)) {
      return { studentId: index.byEdesisId.get(keys.edesisStudentId), method: 'edesis_ogrenci_id' };
    }
    if (runtimeMap.has(keys.edesisStudentId)) {
      return { studentId: runtimeMap.get(keys.edesisStudentId), method: 'runtime_edesis_id' };
    }
  }

  if (keys.email && index.byEmail.has(keys.email)) {
    return { studentId: index.byEmail.get(keys.email), method: 'email' };
  }

  if (keys.name) {
    const byName = matchByNameKeys(keys, index);
    if (byName.studentId) return byName;
  }

  const ph = phoneTail10(keys.phone);
  if (ph.length >= 10 && index.byPhone.has(ph)) {
    return { studentId: index.byPhone.get(ph), method: 'phone' };
  }

  const pph = phoneTail10(keys.parentPhone);
  if (pph.length >= 10 && index.byParentPhone.has(pph)) {
    return { studentId: index.byParentPhone.get(pph), method: 'parent_phone' };
  }

  return { studentId: null, method: null };
}

export function processEdesisRows(rows, students) {
  const index = buildStudentIndex(students);
  const runtimeMap = new Map();
  const drafts = [];
  const unmatched = [];
  const matchedByMethod = {};

  for (const row of rows) {
    const keys = studentMatchKeysFromEdesisRow(row);
    const { studentId, method } = resolveStudentIdFromEdesis(keys, index, runtimeMap);
    if (!studentId) {
      unmatched.push({
        edesisStudentId: keys.edesisStudentId || null,
        email: keys.email || null,
        phone: keys.phone || null,
        name: keys.name || null,
        hint: !keys.email && !keys.name && !keys.edesisStudentId
          ? 'Satırda öğrenci bilgisi yok — API sınav listesi döndürüyor olabilir'
          : keys.name
            ? `İsim eşleşmedi: "${keys.name}" — Smart Koçluk öğrenci adıyla aynı olmalı (sıra farkı OK)`
            : 'E-posta/telefon/Edesis ID ile de eşleşmedi'
      });
      continue;
    }
    if (keys.edesisStudentId) runtimeMap.set(keys.edesisStudentId, studentId);
    matchedByMethod[method] = (matchedByMethod[method] || 0) + 1;
    drafts.push({ row, keys, studentId, method });
  }

  return { drafts, unmatched, matchedByMethod };
}

/** Tek öğrenci eşleme kontrolü (destek / debug) */
export function findStudentMatchPreview(students, { name, email } = {}) {
  const index = buildStudentIndex(students);
  const keys = {
    edesisStudentId: '',
    email: normalizeEmail(email),
    phone: '',
    parentPhone: '',
    name: name || '',
    tc: '',
    schoolNo: ''
  };
  const { studentId, method } = resolveStudentIdFromEdesis(keys, index, new Map());
  const student = studentId ? students.find((s) => s.id === studentId) : null;
  const nameHits = students
    .filter((s) => normalizePersonName(s.name).includes(normalizePersonName(name || '').split(' ')[0] || '___'))
    .slice(0, 5)
    .map((s) => ({ id: s.id, name: s.name, email: s.email || null }));
  return { keys, studentId, method, student, nameHits };
}

export const EDESIS_MATCHING_GUIDE = {
  tr: [
    'Önce e-posta eşleşir (aynı mail yeterli — BELEN RODOPLU / Belen Rodoplu fark etmez)',
    'Sonra ad soyad (büyük harf OK, sıra farkı OK)',
    'fetched=0 ise API satır göndermiyor — JSON içe aktar',
    'Öğrenci kartında e-posta boşsa users tablosundan da okunur'
  ]
};
