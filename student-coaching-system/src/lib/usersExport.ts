import * as XLSX from 'xlsx';
import type { SystemUser } from '../context/AuthContext';
import type { Coach, Student, UserRole } from '../types';
import { formatClassLevelLabel } from '../types';
import { userRoleTags } from '../config/rolePermissions';
import {
  getDaysLeftFromEndDate,
  indexStudentsByPlatformLink,
  isUserActiveAccount,
  isUserExpiredAccount,
  normalizeStudentBranchKey,
  resolveStudentForUser
} from './userStats';
import { findStudentForPlatformUser } from './userRowToSystemUser';
import { downloadLessonListPdf } from './pdfLiveWeekGrid';

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Süper Admin',
  admin: 'Yönetici',
  coach: 'Koç',
  teacher: 'Öğretmen',
  student: 'Öğrenci'
};

export type UserExportRow = {
  adSoyad: string;
  eposta: string;
  telefon: string;
  roller: string;
  durum: string;
  sinif: string;
  sube: string;
  koc: string;
  veliAdi: string;
  veliTelefon: string;
  donem: string;
  kurum: string;
  paket: string;
  baslangic: string;
  bitis: string;
  kalanGun: string;
  olusturma: string;
};

export type UserExportContext = {
  users: SystemUser[];
  studentLinkIndex: ReturnType<typeof indexStudentsByPlatformLink>;
  linkedStudents: Student[];
  coaches: Coach[];
  institutionNameById: Map<string, string>;
};

function formatTrDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('tr-TR');
}

function accountStatusLabel(user: SystemUser): string {
  if (user.isActive === false) return 'Pasif';
  if (isUserExpiredAccount(user)) return 'Süresi dolmuş';
  if (isUserActiveAccount(user)) return 'Aktif';
  return '—';
}

function roleLabelsForUser(user: SystemUser): string {
  const tags = userRoleTags(user as { role: UserRole; roles?: UserRole[] });
  return tags.map((t) => ROLE_LABELS[t] || t).join(' · ');
}

function resolveStudent(
  user: SystemUser,
  ctx: Pick<UserExportContext, 'studentLinkIndex' | 'linkedStudents'>
): Student | undefined {
  const tags = userRoleTags(user as { role: UserRole; roles?: UserRole[] });
  if (!tags.includes('student')) return undefined;
  return (
    resolveStudentForUser(
      { id: user.id, email: user.email, studentId: user.studentId },
      ctx.studentLinkIndex
    ) ??
    findStudentForPlatformUser(
      {
        platformUserId: user.id,
        email: user.email,
        studentId: user.studentId
      },
      ctx.linkedStudents
    )
  );
}

export function buildUserExportRows(ctx: UserExportContext): UserExportRow[] {
  const coachById = new Map(ctx.coaches.map((c) => [c.id, c]));

  return ctx.users.map((user) => {
    const student = resolveStudent(user, ctx);
    const coachId = student?.coachId || user.coachId || '';
    const coach = coachId ? coachById.get(String(coachId)) : undefined;
    const institutionId = String(student?.institutionId || user.institutionId || '').trim();
    const daysLeft = getDaysLeftFromEndDate(user.endDate);
    const branchKey = normalizeStudentBranchKey(student?.school);

    return {
      adSoyad: user.name || '',
      eposta: user.email || '',
      telefon: user.phone || student?.phone || '',
      roller: roleLabelsForUser(user),
      durum: accountStatusLabel(user),
      sinif: student?.classLevel != null ? formatClassLevelLabel(student.classLevel) : '',
      sube: branchKey || (student?.school ? String(student.school) : ''),
      koc: coach?.name || '',
      veliAdi: student?.parentName || '',
      veliTelefon: student?.parentPhone || '',
      donem: user.academicYearLabel || '',
      kurum: (institutionId && ctx.institutionNameById.get(institutionId)) || '',
      paket: user.package || '',
      baslangic: formatTrDate(user.startDate),
      bitis: formatTrDate(user.endDate),
      kalanGun: daysLeft == null ? '' : String(daysLeft),
      olusturma: formatTrDate(user.createdAt)
    };
  });
}

function safeFilePart(s: string) {
  return (
    String(s || 'kullanicilar')
      .trim()
      .replace(/[^\w\u00C0-\u024F\s-]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'kullanicilar'
  );
}

export function exportUsersToExcel(rows: UserExportRow[], fileLabel = 'kullanicilar') {
  if (!rows.length) throw new Error('Dışa aktarılacak kullanıcı yok');

  const sheetRows = rows.map((r) => ({
    'Ad Soyad': r.adSoyad,
    'E-posta': r.eposta,
    Telefon: r.telefon,
    Roller: r.roller,
    Durum: r.durum,
    Sınıf: r.sinif,
    Şube: r.sube,
    Koç: r.koc,
    'Veli adı': r.veliAdi,
    'Veli telefon': r.veliTelefon,
    Dönem: r.donem,
    Kurum: r.kurum,
    Paket: r.paket,
    Başlangıç: r.baslangic,
    Bitiş: r.bitis,
    'Kalan gün': r.kalanGun,
    Oluşturma: r.olusturma
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws['!cols'] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Kullanıcılar');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${safeFilePart(fileLabel)}-${stamp}.xlsx`);
}

export async function exportUsersToPdf(opts: {
  rows: UserExportRow[];
  filterSummaryLines?: string[];
  fileLabel?: string;
  institutionName?: string;
}) {
  const { rows, filterSummaryLines = [], fileLabel = 'kullanicilar', institutionName } = opts;
  if (!rows.length) throw new Error('Dışa aktarılacak kullanıcı yok');

  const stamp = new Date().toISOString().slice(0, 10);
  const listLines = rows.map((r) => {
    const parts = [
      r.adSoyad || '—',
      r.eposta || '—',
      r.telefon || '—',
      r.roller || '—',
      r.durum || '—',
      r.sinif || '—',
      r.sube ? `Şube ${r.sube}` : '—',
      r.koc || '—',
      r.donem || '—',
      r.kurum || '—'
    ];
    return parts.join('  |  ');
  });

  await downloadLessonListPdf({
    filename: `${safeFilePart(fileLabel)}-${stamp}.pdf`,
    titleLine: 'Kullanıcı listesi',
    subtitleLines: [
      `Toplam: ${rows.length} kayıt · ${new Date().toLocaleString('tr-TR')}`,
      ...filterSummaryLines.filter(Boolean)
    ],
    listHeading:
      'Ad Soyad  |  E-posta  |  Telefon  |  Rol  |  Durum  |  Sınıf  |  Şube  |  Koç  |  Dönem  |  Kurum',
    lessonLines: listLines,
    footerNote: 'Liste, Kullanıcı Yönetimi ekranındaki aktif süzgeçlere göre oluşturulmuştur.',
    branding: institutionName ? { institutionName } : undefined
  });
}

export function buildUserExportFilterSummary(filters: {
  searchTerm?: string;
  filterRole?: UserRole | 'all';
  filterStatus?: 'all' | 'active' | 'expired' | 'inactive';
  filterInstitutionName?: string;
  filterClassLevelLabel?: string;
  filterBranch?: string;
  filterAcademicYear?: string;
  filterCoachName?: string;
}): string[] {
  const lines: string[] = [];
  if (filters.searchTerm?.trim()) lines.push(`Arama: ${filters.searchTerm.trim()}`);
  if (filters.filterRole && filters.filterRole !== 'all') {
    lines.push(`Rol: ${ROLE_LABELS[filters.filterRole] || filters.filterRole}`);
  }
  if (filters.filterStatus && filters.filterStatus !== 'all') {
    const statusMap = { active: 'Aktif', expired: 'Süresi dolmuş', inactive: 'Pasif' } as const;
    lines.push(`Durum: ${statusMap[filters.filterStatus]}`);
  }
  if (filters.filterInstitutionName) lines.push(`Kurum: ${filters.filterInstitutionName}`);
  if (filters.filterClassLevelLabel) lines.push(`Sınıf: ${filters.filterClassLevelLabel}`);
  if (filters.filterBranch && filters.filterBranch !== 'all') {
    lines.push(
      filters.filterBranch === '__unknown__'
        ? 'Şube: Belirtilmemiş'
        : `Şube: ${filters.filterBranch}`
    );
  }
  if (filters.filterAcademicYear && filters.filterAcademicYear !== 'all') {
    lines.push(
      filters.filterAcademicYear === '__unset__'
        ? 'Dönem: Atanmamış'
        : `Dönem: ${filters.filterAcademicYear}`
    );
  }
  if (filters.filterCoachName) lines.push(`Koç: ${filters.filterCoachName}`);
  if (!lines.length) lines.push('Süzgeç: Tüm kullanıcılar');
  return lines;
}
