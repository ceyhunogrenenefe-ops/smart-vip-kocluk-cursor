const DEFAULT_STUDY = {
  class56: 'https://kurumsal.ornek.edu/tr/etut-56',
  class78: 'https://kurumsal.ornek.edu/tr/etut-78',
  class911: 'https://kurumsal.ornek.edu/tr/etut-911',
  yks: 'https://kurumsal.ornek.edu/tr/etut-yks'
};

const DEFAULT_EXAMS = {
  lise: 'https://kurumsal.ornek.edu/tr/deneme-lise',
  yos: 'https://kurumsal.ornek.edu/tr/deneme-yos',
  class34: 'https://kurumsal.ornek.edu/tr/deneme-34',
  class56: 'https://kurumsal.ornek.edu/tr/deneme-56',
  class78: 'https://kurumsal.ornek.edu/tr/deneme-78',
  optic: 'https://kurumsal.ornek.edu/tr/sanal-optik',
  examBlocks: 'https://kurumsal.ornek.edu/tr/sinav-bloklari',
  exam: 'https://kurumsal.ornek.edu/tr/deneme'
};

const DEFAULT_POOLS = {
  pool1: 'https://kurumsal.ornek.edu/tr/havuz-1',
  pool2: 'https://kurumsal.ornek.edu/tr/havuz-2'
};

export const DEFAULT_ACADEMIC_LINKS = {
  studyClasses: { ...DEFAULT_STUDY },
  exams: { ...DEFAULT_EXAMS },
  questionPools: { ...DEFAULT_POOLS }
};

export const ACADEMIC_EXAM_ROOM_LABELS = {
  lise: 'Lise Deneme Sınavı',
  yos: 'YÖS Deneme Sınavı',
  class34: '3-4. Sınıf Deneme Sınavı',
  class56: '5-6. Sınıf Deneme Sınavı',
  class78: '7-8. Sınıf Deneme Sınavı'
};

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(base[k] && typeof base[k] === 'object' ? base[k] : {}, v);
    } else if (typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

export function coerceAcademicLinks(raw) {
  const d = DEFAULT_ACADEMIC_LINKS;
  if (!raw || typeof raw !== 'object') return { ...d, studyClasses: { ...d.studyClasses }, exams: { ...d.exams }, questionPools: { ...d.questionPools } };
  const merged = deepMerge(d, raw);
  if (merged.exams?.exam && !merged.exams?.lise) {
    merged.exams.lise = merged.exams.exam;
  }
  return merged;
}

export function normalizeAcademicLinksStore(raw) {
  if (!raw || typeof raw !== 'object') {
    return { default: coerceAcademicLinks(null), byInstitution: {} };
  }
  if (raw.default || raw.byInstitution) {
    return {
      default: coerceAcademicLinks(raw.default),
      byInstitution: raw.byInstitution && typeof raw.byInstitution === 'object' ? raw.byInstitution : {}
    };
  }
  return { default: coerceAcademicLinks(raw), byInstitution: {} };
}

export function linksForInstitution(store, institutionId) {
  const normalized = normalizeAcademicLinksStore(store);
  const base = coerceAcademicLinks(normalized.default);
  const iid = String(institutionId || '').trim();
  if (!iid) return base;
  const patch = normalized.byInstitution[iid];
  if (!patch) return base;
  return coerceAcademicLinks(deepMerge(base, coerceAcademicLinks(patch)));
}

export function upsertInstitutionLinks(store, institutionId, patchLinks) {
  const normalized = normalizeAcademicLinksStore(store);
  const iid = String(institutionId || '').trim();
  const nextPatch = coerceAcademicLinks(patchLinks);
  if (!iid) {
    return { default: nextPatch, byInstitution: normalized.byInstitution };
  }
  return {
    default: normalized.default,
    byInstitution: {
      ...normalized.byInstitution,
      [iid]: nextPatch
    }
  };
}

export function upsertDefaultLinks(store, patchLinks) {
  const normalized = normalizeAcademicLinksStore(store);
  return {
    default: coerceAcademicLinks(deepMerge(normalized.default, patchLinks)),
    byInstitution: normalized.byInstitution
  };
}
