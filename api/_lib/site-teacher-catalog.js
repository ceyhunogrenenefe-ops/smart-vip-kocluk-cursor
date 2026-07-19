/**
 * onlinevipdershane.com özel ders kadro kataloğu (premium-teachers.js ile senkron).
 * Site kartları silinmez; panele ön-doldurma / slug eşlemesi için kullanılır.
 */
export const SITE_TEACHER_CATALOG_BASE =
  String(process.env.SITE_PUBLIC_ORIGIN || 'https://onlinevipdershane.com').replace(/\/$/, '');

/** @typedef {{ slug: string, name: string, branch: string, university?: string, experience?: number, grades?: string[], photo?: string, role?: string, available?: boolean, live?: boolean, price?: number }} SiteCatalogTeacher */

/** @type {SiteCatalogTeacher[]} */
export const SITE_TEACHER_CATALOG = [
  {
    slug: 'dogan-akturk',
    name: 'Doğan Aktürk',
    branch: 'Matematik',
    university: 'Deneyimli Matematik Öğretmenliği',
    experience: 16,
    grades: ['ortaokul', 'lise', 'lgs', 'yks'],
    photo: 'assets/img/kadro/dogan-akturk.jpg',
    role: 'Matematik · LGS / YKS / KPSS',
    available: true,
    live: true,
    price: 850
  },
  {
    slug: 'merve-matematik',
    name: 'Merve',
    branch: 'Matematik',
    university: 'Ege Üniversitesi',
    experience: 8,
    grades: ['ortaokul', 'lise', 'lgs', 'yks'],
    photo: 'assets/img/kadro/merve-matematik.jpg',
    role: 'Matematik · LGS / TYT · Koç',
    available: true,
    live: true,
    price: 750
  },
  {
    slug: 'gonul-cavusoglu',
    name: 'Gönül Çavuşoğlu',
    branch: 'Fen / Biyoloji',
    university: 'Namık Kemal Üniversitesi',
    experience: 12,
    grades: ['ortaokul', 'lise', 'lgs', 'yks'],
    photo: 'assets/img/kadro/gonul-cavusoglu.png',
    role: 'Fen / Biyoloji · LGS / TYT / AYT',
    available: true,
    live: false,
    price: 800
  },
  {
    slug: 'sultan-kurt',
    name: 'Sultan Kurt',
    branch: 'Türkçe / Edebiyat',
    university: 'Manisa Celal Bayar Üniversitesi',
    experience: 15,
    grades: ['ortaokul', 'lise', 'lgs', 'yks'],
    photo: 'assets/img/kadro/sultan-kurt.jpg',
    role: 'Türkçe / Edebiyat · LGS / YKS',
    available: false,
    live: true,
    price: 700
  },
  {
    slug: 'ali-aktas',
    name: 'Ali Aktaş',
    branch: 'Fizik',
    university: 'Atatürk Üniversitesi',
    experience: 26,
    grades: ['lise', 'lgs', 'yks'],
    photo: 'assets/img/kadro/ali-aktas.jpg',
    role: 'Fizik · TYT / AYT',
    available: true,
    live: false,
    price: 900
  },
  {
    slug: 'merve-yetkin',
    name: 'Merve Yetkin',
    branch: 'Türkçe',
    university: 'Mehmet Akif Ersoy Üniversitesi',
    experience: 10,
    grades: ['ilkokul', 'ortaokul'],
    photo: 'assets/img/kadro/merve-yetkin.png',
    role: 'Türkçe · Çocuk edebiyatı',
    available: true,
    live: true,
    price: 650
  },
  {
    slug: 'demet',
    name: 'Demet',
    branch: 'Matematik',
    university: 'İlköğretim Matematik Öğretmenliği',
    experience: 9,
    grades: ['ilkokul', 'ortaokul'],
    photo: 'assets/img/kadro/demet.jpg',
    role: 'İlköğretim Matematik',
    available: true,
    live: false,
    price: 600
  },
  {
    slug: 'tayyibe-ogrenenefe',
    name: 'Tayyibe Öğrenenefe',
    branch: 'Biyoloji',
    university: 'Dicle Üniversitesi',
    experience: 16,
    grades: ['ortaokul', 'lise', 'yks'],
    photo: 'assets/img/kadro/tayyibe-ogrenenefe.jpg',
    role: 'Biyoloji',
    available: true,
    live: true,
    price: 750
  },
  {
    slug: 'nadide-akturk',
    name: 'Nadide Aktürk',
    branch: 'Sosyal Bilgiler',
    university: 'Süleyman Demirel Üniversitesi',
    experience: 15,
    grades: ['ortaokul', 'lgs'],
    photo: 'assets/img/kadro/nadide-akturk.jpg',
    role: 'Sosyal Bilgiler · Çocuk Gelişimi',
    available: false,
    live: false,
    price: 650
  },
  {
    slug: 'mustafa-kozan',
    name: 'Mustafa Kozan',
    branch: 'Sosyal Bilgiler',
    university: 'Sosyal Bilgiler Öğretmenliği',
    experience: 11,
    grades: ['ortaokul', 'lgs'],
    photo: 'assets/img/kadro/mustafa-kozan.jpg',
    role: 'Sosyal Bilgiler',
    available: true,
    live: true,
    price: 600
  },
  {
    slug: 'mustafa-ozturk',
    name: 'Mustafa Öztürk',
    branch: 'İngilizce',
    university: 'İngilizce Öğretmenliği',
    experience: 12,
    grades: ['ilkokul', 'ortaokul', 'lise'],
    photo: 'assets/img/kadro/mustafa-ozturk.jpg',
    role: 'İngilizce',
    available: true,
    live: false,
    price: 700
  },
  {
    slug: 'turgut-usul',
    name: 'Turgut Usul',
    branch: 'Türkçe',
    university: 'Türkçe Öğretmenliği',
    experience: 14,
    grades: ['ortaokul', 'lgs', 'lise'],
    photo: 'assets/img/kadro/turgut-usul.jpg',
    role: 'Türkçe',
    available: true,
    live: true,
    price: 650
  },
  {
    slug: 'eda-akturk',
    name: 'Eda Aktürk',
    branch: 'Rehberlik',
    university: 'Psikoterapi / Danışmanlık',
    experience: 10,
    grades: ['ilkokul', 'ortaokul', 'lise', 'yks'],
    photo: 'assets/img/kadro/eda-akturk.jpg',
    role: 'Psikoterapist',
    available: true,
    live: false,
    price: 950
  }
];

export function findSiteCatalogBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return SITE_TEACHER_CATALOG.find((t) => t.slug === s) || null;
}

function absolutePhotoUrl(photo) {
  const p = String(photo || '').trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${SITE_TEACHER_CATALOG_BASE}/${p.replace(/^\//, '')}`;
}

function splitName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

function examAreasFromRole(role) {
  const r = String(role || '');
  const found = [];
  for (const ex of ['LGS', 'TYT', 'AYT', 'YKS', 'KPSS']) {
    if (r.includes(ex)) found.push(ex);
  }
  return found;
}

function isEmptyVal(v) {
  if (v == null) return true;
  if (typeof v === 'string' && !v.trim()) return true;
  if (Array.isArray(v) && !v.length) return true;
  return false;
}

/**
 * Katalog → teacher_profiles alanları.
 * fillEmptyOnly: mevcut dolu alanları ezme.
 */
export function mapCatalogToProfilePatch(catalogItem, currentRow = {}, { fillEmptyOnly = true } = {}) {
  if (!catalogItem) return { patch: {}, applied: [] };
  const names = splitName(catalogItem.name);
  const photo = absolutePhotoUrl(catalogItem.photo);
  const exams = examAreasFromRole(catalogItem.role);
  const candidates = {
    slug: catalogItem.slug,
    display_name: catalogItem.name,
    first_name: names.first_name,
    last_name: names.last_name,
    branch: catalogItem.branch,
    title: catalogItem.role || null,
    university: catalogItem.university || null,
    experience_years:
      catalogItem.experience != null && catalogItem.experience !== ''
        ? Number(catalogItem.experience)
        : null,
    grade_levels: Array.isArray(catalogItem.grades) ? catalogItem.grades.slice() : [],
    exam_areas: exams,
    photo_url: photo,
    online_lessons: catalogItem.live !== false,
    accepting_students: catalogItem.available !== false,
    private_lesson_enabled: true,
    // Kısa tanıtım için katalogda yoksa role'ü placeholder olarak koy (öğretmen düzenleyebilir)
    short_bio: catalogItem.role
      ? `${catalogItem.name} — ${catalogItem.role}. Online VIP Dershane özel ders kadrosu.`
      : null
  };

  const patch = {};
  const applied = [];
  for (const [k, v] of Object.entries(candidates)) {
    if (v == null || (Array.isArray(v) && !v.length)) continue;
    if (fillEmptyOnly && !isEmptyVal(currentRow[k])) continue;
    // slug: özel — boş veya incomplete otomatik slug ise değiştirilebilir
    if (k === 'slug' && fillEmptyOnly && currentRow.slug && currentRow.published_snapshot) continue;
    patch[k] = v;
    applied.push(k);
  }
  return { patch, applied };
}
