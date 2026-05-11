// Türkçe: Uygulama genelinde kullanılan tipler

// Kullanıcı Rolleri - Eğitim Koçu sistemi
export type UserRole = 'super_admin' | 'admin' | 'coach' | 'teacher' | 'student';

// Sınıf seviyeleri: ilkokul, ortaokul, lise ve YKS puan türleri
export type ClassLevel =
  | 3
  | 4
  | 5
  | 6
  | 7
  | 9
  | 10
  | 11
  | 12
  | 'LGS'
  | 'YOS'
  | 'YKS-Sayısal'
  | 'YKS-Eşit Ağırlık'
  | 'YKS-Sözel';

export type ProgramName = 'ilkokul' | 'lgs' | 'tyt' | 'ayt' | 'yos';

// Plan Türleri
export type OrganizationPlan = 'starter' | 'professional' | 'enterprise';

// Kurum Ayarları
export interface OrganizationSettings {
  primaryColor: string;
  secondaryColor: string;
  customLogo: boolean;
  emailNotifications: boolean;
  whatsappEnabled: boolean;
}

// Kurum İstatistikleri
export interface OrganizationStats {
  totalStudents: number;
  totalCoaches: number; // Koç sayısı
  totalExams: number;
  activeStudents: number;
}

// Kurum/Organizasyon Bilgileri
export interface Organization {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  logo: string;
  plan: OrganizationPlan;
  settings: OrganizationSettings;
  stats: OrganizationStats;
  isActive: boolean;
  createdAt: string;
  expiresAt: string;
}

// Eski Institution tipi (geriye uyumluluk için)
export interface Institution {
  id: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  website: string;
  logo: string;
  isActive: boolean;
  createdAt: string;
}

// Kullanıcı Arayüzü
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  organizationId?: string; // Kurum ID'si (çoklu kiracı için)
  studentId?: string; // Öğrenci için
  coachId?: string; // Koç için
  classLevel?: ClassLevel;
  avatar?: string;
  createdAt: string;
}

// Öğrenci Arayüzü
export interface Student {
  id: string;
  name: string;
  email: string;
  password?: string; // Şifre (kullanıcı girişi için)
  phone: string;
  birthDate?: string;
  parentPhone: string;
  classLevel: ClassLevel;
  school?: string;
  parentName?: string;
  coachId?: string; // Koç ID'si
  programId?: string;
  programName?: ProgramName;
  groupName?: string;
  institutionId?: string;
  /** Supabase Auth kullanıcısı (auth.users.id) — kalıcı bağlantı */
  authUserId?: string;
  /** Platform kullanıcısı (public.users.id) — özel JWT oturumu */
  platformUserId?: string;
  createdAt: string;
}

// Eğitim Koçu Arayüzü
export interface Coach {
  id: string;
  name: string;
  email: string;
  password?: string; // Şifre (kullanıcı girişi için)
  phone: string;
  subjects: string[]; // Uzmanlık alanları
  institutionId?: string;
  studentIds: string[]; // Bu koça atanan öğrenciler
  bio?: string; // Koç hakkında
  experience?: number; // Deneyim yılı
  createdAt: string;
}

// Ders Arayüzü
export interface Subject {
  id: string;
  name: string;
  classLevel: ClassLevel;
  topics: string[];
}

// Haftalık Takip Kaydı
export interface WeeklyEntry {
  id: string;
  studentId: string;
  date: string;
  subject: string;
  topic: string;
  targetQuestions: number;
  solvedQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  blankAnswers: number;
  coachComment?: string;
  createdAt: string;
  // Kitap Okuma Alanları (Opsiyonel)
  readingMinutes?: number; // Haftalık takipte okunan sayfa (DB alanı `reading_minutes`; legacy isim)
  /** `pages_read` sütunu (tercih edilen) */
  pagesRead?: number;
  /** Telefon/tablet ekran süresi (dakika) */
  screenTimeMinutes?: number;
  bookId?: string; // Okunan kitap ID
  bookTitle?: string; // Kitap adı (quick reference)
}

// Haftalık İstatistikler
export interface WeeklyStats {
  totalTarget: number;
  totalSolved: number;
  totalCorrect: number;
  totalWrong: number;
  totalBlank: number;
  realizationRate: number;
  successRate: number;
  // Kitap Okuma İstatistikleri
  totalReadingMinutes: number;
  averageDailyReading: number;
  booksStarted: number;
  booksCompleted: number;
}

// Konu Havuzu
export interface TopicPool {
  [subject: string]: {
    [classLevel: number | string]: string[];
  };
}

// Konu takibi - Öğrencinin hangi konuları bitirdiği
export interface TopicProgress {
  studentId: string;
  subject: string;
  topic: string;
  completedAt: string;
  entryId?: string; // İlgili haftalık kayıt
}

// Deneme Sınavı Sonucu
export interface ExamSubjectResult {
  name: string;
  net: number;
  correct: number;
  wrong: number;
  blank: number;
}

export interface ExamResult {
  id: string;
  studentId: string;
  examType: '3' | '4' | '5' | '6' | '7' | 'LGS' | 'YOS' | 'TYT' | 'YKS-EA' | 'YKS-SAY' | 'AYT';
  examDate: string;
  source: 'webhook' | 'manual' | 'pdf';
  totalNet: number;
  subjects: ExamSubjectResult[];
  notes?: string;
  createdAt: string;
}

/** Sunucu `POST /api/ai-chat` ile `op: 'analyze_exam'` yanıt gövdesi (özet alanlar) */
export interface AiExamAnalysisSummary {
  subjects: Array<{ name: string; correct: number; wrong: number; blank?: number; net: number }>;
  total_net: number;
  estimated_score_model: number;
  percentile_model: number;
  exam_type_model: 'TYT' | 'LGS' | 'YOS';
  yos_buckets?: { matematik: number; geometri: number; iq: number } | null;
  psychology: Array<{ title: string; text: string }>;
  general_situation: string;
  trajectory: {
    headline: string;
    extrapolated_net_2more: number;
    extrapolated_approx_score: number;
    caveat: string;
  } | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string;
  year_2025_comparison?: string | null;
  year_2024_comparison?: string | null;
  year_2023_comparison?: string | null;
  narrative_summary?: string | null;
}

// AI Koç Önerisi
export interface AICoachSuggestion {
  id: string;
  studentId: string;
  type: 'warning' | 'improvement' | 'success' | 'tip';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: 'weekly' | 'exam' | 'topic';
  createdAt: string;
  isRead: boolean;
}

// PDF Raporu
export interface PDFReport {
  studentName: string;
  weekStart: string;
  weekEnd: string;
  entries: WeeklyEntry[];
  stats: WeeklyStats;
}

// Grafik Verisi
export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    fill?: boolean;
  }[];
}

// Yardımcı: öğrenci formları ve filtreler
export const CLASS_LEVELS: { value: ClassLevel; label: string }[] = [
  { value: 3, label: '3. Sınıf' },
  { value: 4, label: '4. Sınıf' },
  { value: 5, label: '5. Sınıf' },
  { value: 6, label: '6. Sınıf' },
  { value: 7, label: '7. Sınıf' },
  { value: 'LGS', label: 'LGS (8. Sınıf)' },
  { value: 'YOS', label: 'YÖS' },
  { value: 9, label: '9. Sınıf' },
  { value: 10, label: '10. Sınıf' },
  { value: 11, label: '11. Sınıf' },
  { value: 12, label: '12. Sınıf' },
  { value: 'YKS-Sayısal', label: 'YKS Sayısal' },
  { value: 'YKS-Eşit Ağırlık', label: 'YKS Eşit Ağırlık' },
  { value: 'YKS-Sözel', label: 'YKS Sözel' },
];

/** HTML select dönüşü → ClassLevel */
export function parseClassLevelFromForm(value: string): ClassLevel {
  if (value === 'LGS') return 'LGS';
  if (value === 'YOS') return 'YOS';
  if (value.startsWith('YKS-')) return value as ClassLevel;
  const n = parseInt(value, 10);
  return n as ClassLevel;
}

export function formatClassLevelLabel(level: ClassLevel | string | number | undefined | null): string {
  if (level === undefined || level === null) return '—';
  const found = CLASS_LEVELS.find(l => l.value === level);
  if (found) return found.label;
  return String(level);
}

/** Konu Havuzu sayfası: tüm sınıf / YKS seçenekleri (sıralı) */
export const TOPIC_CLASS_OPTIONS: { value: string; label: string }[] = [
  ...([3, 4, 5, 6, 7] as const).map(n => ({ value: String(n), label: `${n}. Sınıf` })),
  { value: 'LGS', label: 'LGS (8. Sınıf)' },
  { value: 'YOS', label: 'YÖS' },
  ...([9, 10, 11, 12] as const).map(n => ({ value: String(n), label: `${n}. Sınıf` })),
  { value: 'YKS-Sayısal', label: 'YKS Sayısal' },
  { value: 'YKS-Eşit Ağırlık', label: 'YKS Eşit Ağırlık' },
  { value: 'YKS-Sözel', label: 'YKS Sözel' },
];

export const PROGRAM_OPTIONS: { value: ProgramName; label: string }[] = [
  { value: 'ilkokul', label: 'İlkokul-Ortaokul' },
  { value: 'lgs', label: 'LGS' },
  { value: 'tyt', label: 'TYT' },
  { value: 'ayt', label: 'AYT' },
  { value: 'yos', label: 'YÖS' }
];

export const inferProgramName = (classLevel: ClassLevel | string | number | undefined): ProgramName => {
  if (classLevel === 'YOS') return 'yos';
  if (classLevel === 'LGS') return 'lgs';
  if (String(classLevel).startsWith('YKS-')) return 'ayt';
  const n = Number(classLevel);
  if (!Number.isNaN(n)) {
    if (n <= 7) return 'ilkokul';
    if (n >= 9 && n <= 12) return 'tyt';
  }
  return 'ilkokul';
};

// ============ KİTAP OKUMA TAKİBİ ============

// Kitap Arayüzü
export interface Book {
  id: string;
  studentId: string;
  title: string;
  author: string;
  totalPages?: number;
  startDate: string;
  endDate?: string;
  status: 'reading' | 'completed' | 'planned';
  rating?: number; // 1-5 arası puan
  notes?: string;
  coverImage?: string;
  createdAt: string;
}

// Okuma Kaydı (Günlük)
export interface ReadingLog {
  id: string;
  studentId: string;
  bookId?: string; // Belirli kitap için (boşsa genel okuma)
  date: string;
  minutesRead: number;
  pagesRead?: number;
  notes?: string;
  createdAt: string;
}

// Okuma İstatistikleri (totalMinutes / averageDailyMinutes = sayfa; legacy alan adları)
export interface ReadingStats {
  totalMinutes: number;
  totalBooks: number;
  completedBooks: number;
  averageDailyMinutes: number;
  readingStreak: number; // Ardışık okuma günü
  mostReadBook?: string;
  longestStreak: number;
}

// Rozet Sistemi
export interface ReadingBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: {
    type: 'streak' | 'books' | 'minutes' | 'days';
    value: number;
  };
  earnedAt?: string;
}

// AI Okuma Yorumu
export interface ReadingComment {
  id: string;
  studentId: string;
  type: 'warning' | 'improvement' | 'success' | 'tip';
  title: string;
  description: string;
  createdAt: string;
}

// ============ YAZILI TAKİBİ ============

// Yazılı Notu (Tek sınav kaydı)
export interface WrittenExamScore {
  id: string;
  studentId: string;
  subject: string;
  semester: 1 | 2; // 1. Dönem veya 2. Dönem
  examType: '1. Yazılı' | '2. Yazılı' | 'Final';
  examNumber: 1 | 2 | 3; // 1, 2 veya 3. yazılı (final tek olabilir)
  score: number;
  date: string;
  notes?: string;
  createdAt: string;
}

// Dönem Notları (Bir öğrencinin bir ders için bir dönemlik notları)
export interface SemesterGrades {
  studentId: string;
  subject: string;
  semester: 1 | 2; // 1. veya 2. dönem
  scores: {
    midterm1?: number;
    midterm2?: number;
    final?: number;
  };
  average: number; // Otomatik hesaplanan ortalama
  updatedAt: string;
}

// Yazılı Takip Özeti (Öğrencinin tüm dersler için genel özeti)
export interface WrittenExamSummary {
  studentId: string;
  semester1: {
    [subject: string]: {
      midterm1?: number;
      midterm2?: number;
      average: number;
    };
  };
  semester2: {
    [subject: string]: {
      midterm1?: number;
      midterm2?: number;
      average: number;
    };
  };
  yearlyAverage: number; // (dönem1 + dönem2) / 2
  overallAverage: number; // Tüm notların ortalaması
  updatedAt: string;
}

// Yazılı İstatistikleri
export interface WrittenExamStats {
  totalExams: number;
  averageScore: number;
  semester1Average: number;
  semester2Average: number;
  yearlyAverage: number;
  bestSubject: string;
  worstSubject: string;
  subjectsAbove85: string[];
  subjectsBelow70: string[];
  improvement: number; // Dönemler arası fark (%)
  totalImprovement: number; // İlk girişten şimdiye kadarki değişim
}

// AI Yazılı Yorumu
export interface WrittenExamComment {
  id: string;
  studentId: string;
  type: 'warning' | 'improvement' | 'success' | 'tip';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  subject?: string; // Belirli bir ders içinse
  createdAt: string;
}

// Öğretmen Yorumu
export interface WrittenExamCoachComment {
  id: string;
  studentId: string;
  subject?: string; // Belirli bir ders içinse (yoksa genel)
  comment: string;
  teacherName: string;
  createdAt: string;
}

export type MeetingStatus = 'planned' | 'completed' | 'missed';

export type TeacherLessonPlatform = 'bbb' | 'zoom' | 'meet' | 'other';
export type TeacherLessonStatus = 'scheduled' | 'completed' | 'cancelled';

/** Canlı ders (Zoom / Meet / BBB / diğer) — API `lesson_date` alanını `date` olarak döner */
export interface TeacherLesson {
  id: string;
  institution_id?: string | null;
  teacher_id: string;
  student_id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  meeting_link: string;
  platform: TeacherLessonPlatform;
  status: TeacherLessonStatus;
  created_at?: string;
  /** Plan süresi (dk); paket kotası birimi bu süreye göre hesaplanır */
  duration_minutes?: number;
  /** Tekrarlayan seri (aynı ID = aynı şablon) */
  series_id?: string | null;
}

/** GET /api/teacher-lessons?op=summary — tamamlanan canlı derslerden öğretmen×öğrenci toplam süre */
export interface TeacherStudentLessonSummaryRow {
  teacher_id: string;
  student_id: string;
  teacher_name: string;
  student_name: string;
  total_minutes: number;
  total_hours: number;
  completed_lesson_count: number;
}

/** Öğrenci–öğretmen canlı ders kotası (API zenginleştirmesi: kullanılan/kalan) */
export interface StudentTeacherLessonQuota {
  id: string;
  institution_id?: string | null;
  student_id: string;
  teacher_id: string;
  /** Paket üst sınırı (ders birimi); süreye göre 1 saatte birden fazla birim düşebilir */
  credits_total: number | null;
  created_at?: string;
  updated_at?: string;
  units_used?: number;
  /** @deprecated kullanılan birim ile aynı (geri uyumluluk) */
  lessons_used?: number;
  remaining?: number | null;
  unlimited?: boolean;
  exhausted?: boolean;
}

/** REST yanıtı: ilişki embed (Supabase join) ile gelen görüşme satırı */
export interface CoachingMeetingRecord {
  id: string;
  institution_id?: string | null;
  coach_id: string;
  student_id: string;
  coach_user_id: string;
  start_time: string;
  end_time: string;
  meet_link: string;
  /** İsteğe bağlı ek katılım bağlantısı (Meet’e ek) */
  link_zoom?: string | null;
  link_bbb?: string | null;
  google_calendar_event_id?: string | null;
  status: MeetingStatus;
  notes?: string | null;
  attended?: boolean | null;
  ai_summary?: string | null;
  whatsapp_created_sent?: boolean;
  whatsapp_reminder_sent?: boolean;
  created_at?: string;
  updated_at?: string;
  students?: Pick<Student, 'name' | 'email' | 'phone'> | null;
  coaches?: Pick<Coach, 'name' | 'email'> | null;
  series_id?: string | null;
}
