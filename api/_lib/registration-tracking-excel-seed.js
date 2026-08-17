/**
 * Ağustos 2026 Kayıt Takibi Excel tahtası (KESİN KAYIT + TAKİP).
 * Aynı aday hem kesin hem takipte ise kesin kayıt kazanır.
 */
import { splitFullName } from './registration-tracking-utils.js';

export const EXCEL_BOARD_SOURCE = 'excel_board_2026_08';
export const EXCEL_BOARD_PERIOD = '2026-2027';

/** @type {{ name: string, grade: string }[]} */
export const EXCEL_CONFIRMED = [
  { name: 'YAĞIZ MEHMET TÜRKER', grade: 'grade_9' },
  { name: 'ABDULSAMET OLGUN', grade: 'grade_9' },

  { name: 'Mehmet Yaman Gültekin', grade: 'grade_10' },
  { name: 'CEYLİN OKUMUŞ', grade: 'grade_10' },
  { name: 'MERVE BURCU KÖSE', grade: 'grade_10' },
  { name: 'ECEMNAZ SEVİMLİ', grade: 'grade_10' },
  { name: 'MEHMET EMRE BAYKARA', grade: 'grade_10' },
  { name: 'HALİL İBRAHİM AKTAŞ', grade: 'grade_10' },
  { name: 'MUSTAFA EFE YILDIRIM', grade: 'grade_10' },
  { name: 'TUANA ELİF YILDIZ', grade: 'grade_10' },
  { name: 'CEYLİN SOMYÜREK', grade: 'grade_10' },
  { name: 'ELA NUR AYER', grade: 'grade_10' },

  { name: 'BAYRAM ÖMÜR YILDIRIM', grade: 'grade_11' },
  { name: 'CEMRE ÇELİK', grade: 'grade_11' },
  { name: 'MELTEM ACAR', grade: 'grade_11' },
  { name: 'ALİ İHSAN URHAN', grade: 'grade_11' },
  { name: 'ASUDE KÜLAHLI', grade: 'grade_11' },
  { name: 'AYŞE NAZ BAŞARSLAN', grade: 'grade_11' },
  { name: 'BEGÜM TÜRKHAN KEYİF', grade: 'grade_11' },
  { name: 'BERRAK ECE GÜMÜŞTAŞ', grade: 'grade_11' },
  { name: 'ECRİN TAŞ', grade: 'grade_11' },
  { name: 'EFE KARACA', grade: 'grade_11' },
  { name: 'ERVA KARACA', grade: 'grade_11' },
  { name: 'EYLÜL NİSA YILDIRIM', grade: 'grade_11' },
  { name: 'YAĞMUR TUĞ', grade: 'grade_11' },
  { name: 'ZEYNEP ASLANHAN', grade: 'grade_11' },
  { name: 'ZEYNEP ESLEM BOZKURT', grade: 'grade_11' },

  { name: 'AHMET RENAS KORKUSUZ', grade: 'yks' },
  { name: 'AJİTA HASHİMİ', grade: 'yks' },
  { name: 'BETÜL FATMA ÖZCAN', grade: 'yks' },
  { name: 'BURÇİN BAYRAK', grade: 'yks' },
  { name: 'HATİCE YAREN AÇIKGÖZ', grade: 'yks' },
  { name: 'EFE ÇONKAR', grade: 'yks' },
  { name: 'M.EMİN ATEŞ', grade: 'yks' },
  { name: 'M.ORHUN GEÇİMLİ', grade: 'yks' },
  { name: 'NESİBE ESMA YAVUZ', grade: 'yks' },
  { name: 'RAVZA BAHAR BAYDAROĞLU', grade: 'yks' },
  { name: 'VEDAT PEHLİVAN', grade: 'yks' },
  { name: 'VİLDAN KÖPRÜLÜ', grade: 'yks' },
  { name: 'ZEYNEP BETÜL TIĞLI', grade: 'yks' },
  { name: 'ADİL DEMİRTAŞ', grade: 'yks' },

  { name: 'ARİF FARUK TÜFEKÇİ', grade: 'yos' },
  { name: 'CEMİLE YILDIZ', grade: 'yos' },
  { name: 'FİRDEVS GEBEL', grade: 'yos' },
  { name: 'GÖKDENİZ AYRAN', grade: 'yos' },
  { name: 'HANSA YAĞMUR ÇİÇEK', grade: 'yos' },
  { name: 'M.EMİN ÇELENK', grade: 'yos' },
  { name: 'NURSEREN FİLİZ AKAR', grade: 'yos' },
  { name: 'VEHBİ HOCAOĞLU', grade: 'yos' },
  { name: 'YAVUZ SELİM DOS', grade: 'yos' },
  { name: 'YUSUF FURKAN DURNA', grade: 'yos' },
  { name: 'ZEHRA ÜLKER', grade: 'yos' },

  { name: 'AYÇA ÇETİNER', grade: 'private_lesson' }
];

/** @type {{ name: string, grade: string }[]} */
export const EXCEL_TRACKING = [
  { name: 'AYŞE SENA TUNCER', grade: 'grade_9' },
  { name: 'KEREM DEMİR', grade: 'grade_9' },
  { name: 'MESUDE OLGUN', grade: 'grade_9' },

  { name: 'GÜLSÜM ELİF EKŞİOĞLU', grade: 'grade_10' },
  { name: 'MERT ASLAN YILDIZ', grade: 'grade_10' },
  { name: 'EKİN SEVİNÇ', grade: 'grade_10' },
  { name: 'MELİS OKUTURLAR', grade: 'grade_10' },

  { name: 'CANSU ILGIN AKÇA', grade: 'grade_11' },
  { name: 'BENGİSU ELİF ARDIÇ', grade: 'grade_11' },
  { name: 'HAMZA SAKA', grade: 'grade_11' },
  { name: 'M.FURKAN BİLEN', grade: 'grade_11' },
  { name: 'SALİH KEREM EKİCİ', grade: 'grade_11' },
  { name: 'ZEYNEP BERRA GÖKÇE', grade: 'grade_11' },
  { name: 'ZÜBEYDE BADE MERSİN', grade: 'grade_11' },

  { name: 'BURÇİN BAYRAK', grade: 'yks' },
  { name: 'DİLA ÖZTÜRK', grade: 'yks' },

  { name: 'BELİZ KIZILYÜCE', grade: 'private_lesson' },
  { name: 'AYÇA ÇETİNER', grade: 'private_lesson' },
  { name: 'BELEN RODOPLU', grade: 'private_lesson' }
];

export function excelLeadKey(name, grade) {
  return `${String(name || '').toLocaleLowerCase('tr-TR').trim()}|${grade}`;
}

/** Takip listesinden, aynı programda kesin kaydı olan adayları çıkarır. */
export function uniqueExcelRows() {
  const confirmedKeys = new Set(EXCEL_CONFIRMED.map((r) => excelLeadKey(r.name, r.grade)));
  const tracking = EXCEL_TRACKING.filter((r) => !confirmedKeys.has(excelLeadKey(r.name, r.grade)));
  return { confirmed: EXCEL_CONFIRMED, tracking };
}

function toInsertRow(institutionId, row, primaryStatus) {
  const { first_name, last_name } = splitFullName(row.name);
  const now = new Date().toISOString();
  return {
    institution_id: institutionId,
    academic_period_key: EXCEL_BOARD_PERIOD,
    first_name: first_name || row.name,
    last_name: last_name || '',
    grade_program: row.grade,
    primary_status: primaryStatus,
    stage: primaryStatus === 'confirmed' ? 'confirmed' : 'new_lead',
    temperature: primaryStatus === 'confirmed' ? 'hot' : 'warm',
    source: EXCEL_BOARD_SOURCE,
    notes: 'Excel kayıt tahtasından aktarıldı',
    confirmed_at: primaryStatus === 'confirmed' ? now : null,
    created_at: now,
    updated_at: now
  };
}

function existingKey(row) {
  const full = String(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`)
    .toLocaleLowerCase('tr-TR')
    .trim();
  return `${full}|${row.grade_program}`;
}

/**
 * Idempotent: aynı kurum + ad + program varsa atlar.
 * @returns {Promise<{ inserted: number, skipped: number, confirmed: number, tracking: number }>}
 */
export async function ensureExcelBoardLeads(supabaseAdmin, institutionId) {
  if (!institutionId) {
    return { inserted: 0, skipped: 0, confirmed: 0, tracking: 0 };
  }

  const { confirmed, tracking } = uniqueExcelRows();
  const { data: existing, error } = await supabaseAdmin
    .from('registration_leads')
    .select('id, first_name, last_name, full_name, grade_program')
    .eq('institution_id', institutionId)
    .is('deleted_at', null)
    .limit(8000);
  if (error) throw error;

  const have = new Set((existing || []).map(existingKey));
  const rows = [];

  for (const r of confirmed) {
    const key = excelLeadKey(r.name, r.grade);
    if (have.has(key)) continue;
    have.add(key);
    rows.push(toInsertRow(institutionId, r, 'confirmed'));
  }
  for (const r of tracking) {
    const key = excelLeadKey(r.name, r.grade);
    if (have.has(key)) continue;
    have.add(key);
    rows.push(toInsertRow(institutionId, r, 'tracking'));
  }

  const skipped = confirmed.length + tracking.length - rows.length;
  if (!rows.length) {
    return {
      inserted: 0,
      skipped,
      confirmed: confirmed.length,
      tracking: tracking.length
    };
  }

  const { error: insErr } = await supabaseAdmin.from('registration_leads').insert(rows);
  if (insErr) throw insErr;

  return {
    inserted: rows.length,
    skipped,
    confirmed: confirmed.length,
    tracking: tracking.length
  };
}
