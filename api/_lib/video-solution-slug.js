import { VIDEO_SOLUTION_SLUG_REGEX } from './video-solution-schema.js';

function slugifyPart(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Yeni çalışma için benzersiz slug önerisi */
export function proposeVideoSolutionSlug({
  schoolYear,
  gradeLevel,
  subject,
  workType,
  term,
  examNumber
}) {
  const yil = slugifyPart(String(schoolYear || '').replace(/\s+/g, '-')).slice(0, 16);
  const ders = slugifyPart(subject).slice(0, 24);
  const wt = workType && workType !== 'genel' ? slugifyPart(workType) : '';
  const ek =
    term != null && term !== ''
      ? `d${term}${examNumber != null && examNumber !== '' ? `y${examNumber}` : ''}`
      : '';
  const suffix = Math.random().toString(36).slice(2, 6);
  const parts = [yil, String(gradeLevel || ''), ders, wt, ek, suffix].filter(Boolean);
  let slug = parts.join('-').replace(/-+/g, '-').slice(0, 118);
  if (slug.length < 3) slug = `vc-${suffix}-${Date.now().toString(36).slice(-4)}`;
  return slug;
}

export function normalizeVideoSolutionSlug(ham) {
  const s = slugifyPart(String(ham || '').replace(/\//g, '-'));
  if (!s || s.length < 3) return null;
  const trimmed = s.slice(0, 120);
  return VIDEO_SOLUTION_SLUG_REGEX.test(trimmed) ? trimmed : null;
}
