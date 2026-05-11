// Türkçe: Uygulama genel durum yönetimi - Supabase Gerçek Veritabanı ile
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Student,
  Coach,
  WeeklyEntry,
  User,
  UserRole,
  TopicPool,
  TopicProgress,
  Institution,
  ExamResult,
  AICoachSuggestion,
  Book,
  ReadingLog,
  ReadingStats,
  WrittenExamScore,
  WrittenExamStats,
  WrittenExamComment,
  ClassLevel,
  inferProgramName
} from '../types';
import { db } from '../lib/database';
import { resolveCoachRecordId, resolveStudentRecordId } from '../lib/coachResolve';
import { isSupabaseReady, supabase, supabaseBaseUrl, verifySupabaseReachable } from '../lib/supabase';
import type { Database } from '../lib/supabase';

type ApiStudentRow = Database['public']['Tables']['students']['Row'];
import { useAuth } from './AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { topicPool as defaultTopicPool } from '../data/mockData';
import { yosTopicPool } from '../data/yosTopicPool';

// LocalStorage anahtarları
const STORAGE_KEYS = {
  students: 'coaching_students',
  coaches: 'coaching_coaches',
  weeklyEntries: 'coaching_weekly_entries',
  institutions: 'coaching_institutions',
  activeInstitutionId: 'coaching_active_institution',
  customTopics: 'coaching_custom_topics',
  topicProgress: 'coaching_topic_progress',
  examResults: 'coaching_exam_results',
  aiSuggestions: 'coaching_ai_suggestions',
  books: 'coaching_books',
  readingLogs: 'coaching_reading_logs',
  writtenExamScores: 'coaching_written_exam_scores',
  writtenExamSubjects: 'coaching_written_exam_subjects',
  writtenExamSubjectsByStudent: 'coaching_written_exam_subjects_by_student'
};

const DEFAULT_WRITTEN_EXAM_SUBJECTS = [
  'Türkçe',
  'Matematik',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'İngilizce',
  'Din Kültürü'
];

const mergeTopicPools = (base: TopicPool, overrides: TopicPool): TopicPool => {
  const merged: TopicPool = { ...base };
  Object.entries(overrides).forEach(([subject, levels]) => {
    const baseLevels = (base[subject] || {}) as Record<string, string[]>;
    const nextLevels = { ...baseLevels };
    Object.entries(levels || {}).forEach(([levelKey, incoming]) => {
      const current = nextLevels[levelKey] || [];
      nextLevels[levelKey] = Array.from(new Set([...(current || []), ...((incoming as string[]) || [])]));
    });
    merged[subject] = nextLevels;
  });
  return merged;
};

/** DB listesi ile localStorage birleştir — aynı e-posta için DB öncelikli */
const mergeStudentsByEmail = (fromDb: Student[], fromLocal: Student[]): Student[] => {
  const emails = new Set(fromDb.map(s => s.email.toLowerCase()));
  const out = [...fromDb];
  for (const s of fromLocal) {
    if (!emails.has(s.email.toLowerCase())) {
      out.push(s);
      emails.add(s.email.toLowerCase());
    }
  }
  return out;
};

const mergeCoachesByEmail = (fromDb: Coach[], fromLocal: Coach[]): Coach[] => {
  const emails = new Set(fromDb.map(c => c.email.toLowerCase()));
  const out = [...fromDb];
  for (const c of fromLocal) {
    if (!emails.has(c.email.toLowerCase())) {
      out.push(c);
      emails.add(c.email.toLowerCase());
    }
  }
  return out;
};

const normalizeClassLevel = (raw: unknown): ClassLevel => {
  if (typeof raw === 'number') return raw as ClassLevel;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === 'LGS' || trimmed === 'YOS' || trimmed.startsWith('YKS-')) return trimmed as ClassLevel;
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) return parsed as ClassLevel;
  }
  return raw as ClassLevel;
};

/** API satırını öğrenci kartına çevirir — PATCH sonrası tek doğruluk kaynağı */
function studentRowToStudent(s: ApiStudentRow): Student {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    platformUserId: s.platform_user_id || undefined,
    phone: s.phone || undefined,
    birthDate: s.birth_date || undefined,
    classLevel: normalizeClassLevel(s.class_level),
    school: s.school || undefined,
    parentName: s.parent_name || undefined,
    parentPhone: s.parent_phone || undefined,
    coachId: s.coach_id || undefined,
    institutionId: s.institution_id || undefined,
    programId: s.program_id || undefined,
    programName: inferProgramName(s.class_level),
    createdAt: s.created_at
  };
}

// LocalStorage'dan veri yükle
const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error(`${key} yüklenirken hata:`, error);
  }
  return defaultValue;
};

// LocalStorage'a veri kaydet
const saveToStorage = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`${key} kaydedilirken hata:`, error);
  }
};

// Varsayılan kurum
const createDefaultInstitution = (): Institution => ({
  id: 'default',
  name: 'SMART VİP KOÇLUK',
  phone: '0212 555 00 00',
  address: 'Merkez Mahallesi, Atatürk Caddesi No:123, İstanbul',
  email: 'info@smartvipkocluk.com',
  website: 'www.smartvipkocluk.com',
  logo: '',
  isActive: true,
  createdAt: new Date().toISOString()
});

interface AppState {
  // Kullanıcı
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;

  // Öğrenciler
  students: Student[];
  addStudent: (student: Student) => Promise<{ student: Student; persisted: boolean }>;
  updateStudent: (id: string, student: Partial<Student>) => Promise<void>;
  deleteStudent: (id: string) => void;

  // Eğitim Koçları
  coaches: Coach[];
  addCoach: (coach: Coach) => void;
  updateCoach: (id: string, coach: Partial<Coach>) => void;
  deleteCoach: (id: string) => void;

  // Haftalık Kayıtlar
  weeklyEntries: WeeklyEntry[];
  addWeeklyEntry: (entry: WeeklyEntry) => void;
  updateWeeklyEntry: (id: string, entry: Partial<WeeklyEntry>) => void;
  deleteWeeklyEntry: (id: string) => void;
  getStudentEntries: (studentId: string) => WeeklyEntry[];

  // Kurum Bilgileri (Çoklu Kurum Desteği)
  institutions: Institution[];
  addInstitution: (
    institution: Institution,
    opts?: { plan?: 'starter' | 'professional' | 'enterprise' }
  ) => Promise<Institution | null>;
  updateInstitution: (id: string, info: Partial<Institution>) => void;
  deleteInstitution: (id: string) => void;
  setActiveInstitution: (id: string) => void;
  institution: Institution;
  activeInstitutionId: string | null;

  // Konu Havuzu
  getTopics: (subject: string, classLevel: number | string) => string[];
  addTopic: (subject: string, classLevel: number | string, topic: string) => void;
  getTopicsByClass: (classLevel: number | string) => {
    regular: Record<string, string[]>;
    tytSubjects: Record<string, string[]>;
    aytSubjects: Record<string, string[]>;
    isYKS: boolean;
  };

  // Konu Takibi
  topicProgress: TopicProgress[];
  markTopicCompleted: (studentId: string, subject: string, topic: string, entryId?: string) => void;
  unmarkTopicCompleted: (studentId: string, subject: string, topic: string) => void;
  getStudentTopicProgress: (studentId: string) => TopicProgress[];
  getCompletedTopicsBySubject: (studentId: string, subject: string) => TopicProgress[];
  resetTopicProgress: (studentId: string) => void;

  // İstatistikler
  getStudentStats: (studentId: string) => {
    totalTarget: number;
    totalSolved: number;
    totalCorrect: number;
    totalWrong: number;
    totalBlank: number;
    realizationRate: number;
    successRate: number;
    totalReadingMinutes: number;
  };

  // Deneme Sınavları
  examResults: ExamResult[];
  addExamResult: (exam: ExamResult) => void;
  updateExamResult: (id: string, exam: Partial<ExamResult>) => void;
  deleteExamResult: (id: string) => void;
  getStudentExamResults: (studentId: string) => ExamResult[];
  getLatestExamResult: (studentId: string) => ExamResult | null;

  // AI Koç Önerileri
  aiSuggestions: AICoachSuggestion[];
  addAISuggestion: (suggestion: AICoachSuggestion) => void;
  markSuggestionRead: (id: string) => void;
  deleteAISuggestion: (id: string) => void;
  getStudentAISuggestions: (studentId: string) => AICoachSuggestion[];
  generateAISuggestions: (studentId: string) => void;

  // Seçili öğrenci
  selectedStudentId: string | null;
  setSelectedStudentId: (id: string | null) => void;

  // ============ KİTAP OKUMA TAKİBİ ============
  books: Book[];
  addBook: (book: Book) => void;
  updateBook: (id: string, book: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  getStudentBooks: (studentId: string) => Book[];

  readingLogs: ReadingLog[];
  addReadingLog: (log: ReadingLog) => void;
  updateReadingLog: (id: string, log: Partial<ReadingLog>) => void;
  deleteReadingLog: (id: string) => void;
  getStudentReadingLogs: (studentId: string) => ReadingLog[];
  getReadingStats: (studentId: string) => ReadingStats;
  getBookReadingTime: (bookId: string) => number;
  getReadingHeatmap: (studentId: string, year: number, month: number) => Record<string, number>;
  getCurrentStreak: (studentId: string) => number;
  getLongestStreak: (studentId: string) => number;
  getReadingComments: (studentId: string) => { type: string; title: string; description: string }[];
  getReadingBadges: (studentId: string) => { id: string; name: string; icon: string; description: string; earned: boolean }[];

  // ============ YAZILI TAKİBİ ============
  writtenExamScores: WrittenExamScore[];
  addWrittenExamScore: (score: WrittenExamScore) => void;
  updateWrittenExamScore: (id: string, score: Partial<WrittenExamScore>) => void;
  deleteWrittenExamScore: (id: string) => void;
  getStudentWrittenExamScores: (studentId: string) => WrittenExamScore[];
  /** Varsayılan yazılı ders şablonu (yeni öğrenci listesi) */
  writtenExamSubjects: string[];
  addWrittenExamSubject: (subject: string) => void;
  removeWrittenExamSubject: (subject: string) => void;
  getWrittenExamSubjectsForStudent: (studentId: string) => string[];
  addWrittenExamSubjectForStudent: (studentId: string, subject: string) => void;
  removeWrittenExamSubjectForStudent: (studentId: string, subject: string) => Promise<void>;
  writtenExamSubjectsByStudent: Record<string, string[]>;
  getSubjectScores: (studentId: string, subject: string) => WrittenExamScore[];
  calculateSemesterAverage: (studentId: string, subject: string, semester: 1 | 2) => number;
  calculateYearlyAverage: (studentId: string, subject: string) => number;
  calculateOverallAverage: (studentId: string) => number;
  getWrittenExamStats: (studentId: string) => WrittenExamStats;
  getWrittenExamComments: (studentId: string) => WrittenExamComment[];
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { effectiveUser, linkedStudent } = useAuth();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('admin');

  // Veritabanından yükle; ilk boyutta localStorage ile hızlı gösterim (Supabase sonradan birleşir)
  const [students, setStudents] = useState<Student[]>(() =>
    loadFromStorage<Student[]>(STORAGE_KEYS.students, [])
  );
  const [coaches, setCoaches] = useState<Coach[]>(() =>
    loadFromStorage<Coach[]>(STORAGE_KEYS.coaches, [])
  );
  const [weeklyEntries, setWeeklyEntries] = useState<WeeklyEntry[]>([]);

  // Kurumlar için state
  const [institutions, setInstitutions] = useState<Institution[]>(() => {
    const stored = loadFromStorage<Institution[]>(STORAGE_KEYS.institutions, []);
    if (stored.length === 0) {
      return [createDefaultInstitution()];
    }
    return stored;
  });

  const [activeInstitutionId, setActiveInstitutionId] = useState<string | null>(() =>
    loadFromStorage<string | null>(STORAGE_KEYS.activeInstitutionId, null)
  );

  // Aktif kurum
  const institution = institutions.find(i => i.id === activeInstitutionId) || institutions[0] || createDefaultInstitution();

  // Topic pool - varsayılan mockData + kullanıcı ekleri (localStorage)
  const [customTopics, setCustomTopics] = useState<TopicPool>(() => {
    const stored = loadFromStorage<TopicPool>(STORAGE_KEYS.customTopics, {});
    return mergeTopicPools(mergeTopicPools(defaultTopicPool, yosTopicPool), stored);
  });
  const [topicProgress, setTopicProgress] = useState<TopicProgress[]>(() =>
    loadFromStorage<TopicProgress[]>(STORAGE_KEYS.topicProgress, [])
  );

  // Deneme Sınavları
  const [examResults, setExamResults] = useState<ExamResult[]>(() =>
    loadFromStorage(STORAGE_KEYS.examResults, [])
  );

  // AI Koç Önerileri
  const [aiSuggestions, setAISuggestions] = useState<AICoachSuggestion[]>(() =>
    loadFromStorage(STORAGE_KEYS.aiSuggestions, [])
  );

  // ============ KİTAP OKUMA TAKİBİ - Gerçek database ============
  const [books, setBooks] = useState<Book[]>([]);
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([]);

  const ensureSupabaseReady = async (): Promise<void> => {
    if (!isSupabaseReady) {
      throw new Error(
        'Supabase yapılandırması eksik/geçersiz. Vercel’de VITE_SUPABASE_* veya SUPABASE_URL + SUPABASE_ANON_KEY (anon) tanımlı mı, Production + Redeploy yapıldı mı kontrol edin.'
      );
    }
    const reachable = await verifySupabaseReachable();
    if (!reachable) {
      throw new Error(
        `Supabase erişilemedi (${supabaseBaseUrl}). URL, anon key, RLS policy ve tablo kurulumunu kontrol edin.`
      );
    }
  };

  // Supabase'den veri yükle (başlangıçta)
  useEffect(() => {
    if (!isSupabaseReady) {
      console.error(
        '[AppContext] Supabase yapılandırması eksik/geçersiz. Fallback kapalı olduğu için uygulama DB olmadan çalışmaz.'
      );
      setStudents([]);
      setCoaches([]);
      setWeeklyEntries([]);
      setBooks([]);
      setReadingLogs([]);
      setWrittenExamScores([]);
      return;
    }

    const loadDataFromDatabase = async () => {
      try {
        await ensureSupabaseReady();

        // Initialize database first
        await db.initializeDatabase();

        // Öğrenci oturumunda kurum filtresi istemci tarafında yanlış eşleşebilir (eski admin seçimi);
        // API zaten rol bazlı döndürür — burada filtre uygulama.
        // Süper admin: seçili kurum filtresini yalnızca öğrenci listesine uygulama — başka kurum
        // öğrencisi users ile eşleşmez ve Kullanıcı Yönetimi PATCH students yapmaz.
        // Koçlar / haftalık kayıtlar: seçili kurum filtresi (performans ve önceki davranış).
        const isStudentRole = effectiveUser?.role === 'student';
        const isSuperAdmin = effectiveUser?.role === 'super_admin';
        const studentInstitutionScope =
          isStudentRole || isSuperAdmin ? undefined : activeInstitutionId || undefined;
        const institutionScope = isStudentRole ? undefined : activeInstitutionId || undefined;

        // Load students from Supabase
        const dbStudents = await db.getStudents(studentInstitutionScope);
        const loadedStudents: Student[] = dbStudents.map(studentRowToStudent);
        setStudents(loadedStudents);

        // Load coaches from Supabase (institution_id zorunlu — aksi halde admin scopedCoaches hepsini eler)
        const dbCoaches = await db.getCoaches(institutionScope);
        const loadedCoaches: Coach[] = dbCoaches.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone || undefined,
          subjects: c.specialties || [],
          studentIds: c.student_ids || [],
          institutionId: c.institution_id || undefined,
          createdAt: c.created_at
        }));
        const legacyInstitutionId =
          activeInstitutionId || institutions[0]?.id || createDefaultInstitution().id;
        const localCoaches = loadFromStorage<Coach[]>(STORAGE_KEYS.coaches, []).map(c => ({
          ...c,
          subjects: Array.isArray(c.subjects) ? c.subjects : [],
          studentIds: Array.isArray(c.studentIds) ? c.studentIds : [],
          institutionId: c.institutionId || legacyInstitutionId
        }));
        setCoaches(mergeCoachesByEmail(loadedCoaches, localCoaches));

        // Load weekly entries from Supabase
        const dbEntries = await db.getWeeklyEntries(undefined, institutionScope);
        const loadedEntries: WeeklyEntry[] = dbEntries.map(e => ({
          id: e.id,
          studentId: e.student_id,
          date: e.date,
          subject: e.subject,
          topic: e.topic,
          targetQuestions: e.target_questions,
          solvedQuestions: e.solved_questions,
          correctAnswers: e.correct,
          wrongAnswers: e.wrong,
          blankAnswers: e.blank,
          coachComment: e.notes || undefined,
          readingMinutes: e.reading_minutes || undefined,
          pagesRead: (e as { pages_read?: number }).pages_read ?? undefined,
          screenTimeMinutes: (e as { screen_time_minutes?: number }).screen_time_minutes ?? undefined,
          bookId: e.book_id || undefined,
          bookTitle: e.book_title || undefined,
          createdAt: e.created_at
        }));
        setWeeklyEntries(loadedEntries);

        // Load institutions from Supabase
        const dbInstitutions = await db.getInstitutions();
        if (dbInstitutions.length > 0) {
          const loadedInstitutions: Institution[] = dbInstitutions.map(i => ({
            id: i.id,
            name: i.name,
            email: i.email,
            phone: i.phone || undefined,
            address: i.address || undefined,
            website: i.website || undefined,
            logo: i.logo || undefined,
            isActive: i.is_active,
            createdAt: i.created_at
          }));
          setInstitutions(loadedInstitutions);
          // Set active institution if not set
          if (!activeInstitutionId && loadedInstitutions.length > 0) {
            setActiveInstitutionId(loadedInstitutions[0].id);
          }
        }

        // Load book readings from Supabase
        const dbBooks = await db.getBookReadings();
        const loadedBooks: Book[] = dbBooks.map(b => ({
          id: b.id,
          studentId: b.student_id,
          title: b.book_title,
          author: b.author || undefined,
          pagesRead: b.pages_read,
          startDate: b.start_date || '',
          endDate: b.end_date || undefined,
          status: 'reading' as const,
          notes: b.notes || undefined,
          institutionId: b.institution_id || undefined,
          createdAt: b.created_at
        }));
        setBooks(loadedBooks);

        // Load written exams from Supabase
        const dbWrittenExams = await db.getWrittenExams();
        const loadedWrittenScores: WrittenExamScore[] = dbWrittenExams.map(w => ({
          id: w.id,
          studentId: w.student_id,
          subject: w.subject,
          semester: w.semester,
          examType: w.exam_type,
          score: w.score,
          date: w.date || new Date().toISOString().split('T')[0],
          notes: w.notes || undefined,
          createdAt: w.created_at
        }));
        setWrittenExamScores(loadedWrittenScores);

        console.log('Veritabanından veriler başarıyla yüklendi');
      } catch (error) {
        console.error('Veritabanı yükleme hatası:', error);
        setStudents([]);
        setCoaches([]);
        setWeeklyEntries([]);
        setBooks([]);
        setReadingLogs([]);
        setWrittenExamScores([]);
      }
    };

    loadDataFromDatabase();
  }, [activeInstitutionId, effectiveUser?.role, effectiveUser?.id]); // Rol/kullanıcı değişince (giriş) yeniden yükle

  // Veriler değiştiğinde localStorage'a kaydet
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.students, students);
  }, [students]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.coaches, coaches);
  }, [coaches]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.weeklyEntries, weeklyEntries);
  }, [weeklyEntries]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.institutions, institutions);
  }, [institutions]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.activeInstitutionId, activeInstitutionId);
  }, [activeInstitutionId]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.customTopics, customTopics);
  }, [customTopics]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.topicProgress, topicProgress);
  }, [topicProgress]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.examResults, examResults);
  }, [examResults]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.aiSuggestions, aiSuggestions);
  }, [aiSuggestions]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.books, books);
  }, [books]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.readingLogs, readingLogs);
  }, [readingLogs]);

  // Öğrenci işlemleri - Supabase database
  const addStudent = async (student: Student) => {
    const resolvedInstitutionId =
      student.institutionId ||
      activeInstitutionId ||
      institution?.id ||
      loadFromStorage<string | null>(STORAGE_KEYS.activeInstitutionId, null) ||
      institutions[0]?.id ||
      null;
    const preferredRowId = student.id?.trim() ? student.id.trim() : undefined;
    await ensureSupabaseReady();

    try {
      const created = await db.createStudent(
        {
          name: student.name,
          email: student.email,
          phone: student.phone,
          birth_date: student.birthDate ?? null,
          class_level: String(student.classLevel),
          school: student.school ?? null,
          parent_name: student.parentName ?? null,
          parent_phone: student.parentPhone ?? null,
          coach_id: student.coachId || null,
          institution_id: resolvedInstitutionId,
          program_id: student.programId || inferProgramName(student.classLevel)
        },
        preferredRowId,
        {
          sync_supabase_auth: true,
          auth_password: student.password?.trim() || ''
        }
      );
      // Convert to Student type and add to state
      const newStudent: Student = {
        id: created.id,
        name: created.name,
        email: created.email,
        password: student.password,
        phone: created.phone || undefined,
        birthDate: created.birth_date || undefined,
        classLevel: normalizeClassLevel(created.class_level),
        school: created.school || undefined,
        parentName: created.parent_name || undefined,
        parentPhone: created.parent_phone || undefined,
        coachId: created.coach_id || undefined,
        institutionId: created.institution_id || undefined,
        programId: created.program_id || undefined,
        programName: inferProgramName(created.class_level),
        createdAt: created.created_at
      };
      setStudents(prev => [...prev, newStudent]);

      // Öğrenci giriş yapabilsin diye users tablosunda da karşılığı olmalı; students.user_id ile bağla
      try {
        const existingUser = await db.getUserByEmail(student.email);
        const passwordToSave = student.password || '123456';

        let platformUserId: string;
        if (existingUser) {
          await db.updateUser(existingUser.id, {
            name: student.name,
            phone: student.phone || null,
            role: 'student',
            password_hash: passwordToSave,
            institution_id: resolvedInstitutionId,
            is_active: true
          });
          platformUserId = existingUser.id;
        } else {
          const createdUser = await db.createUser({
            email: student.email.toLowerCase().trim(),
            name: student.name,
            phone: student.phone || null,
            role: 'student',
            password_hash: passwordToSave,
            institution_id: resolvedInstitutionId,
            is_active: true,
            package: 'trial',
            start_date: new Date().toISOString(),
            end_date: null
          });
          platformUserId = createdUser.id;
        }
        try {
          await db.updateStudent(created.id, {
            platform_user_id: platformUserId
          } as Parameters<(typeof db)['updateStudent']>[1]);
        } catch (linkErr) {
          console.warn('students.platform_user_id bağlantısı atlanıyor:', linkErr);
        }
      } catch (userSyncError) {
        console.error('Öğrenci kullanıcı hesabı senkronizasyon hatası:', userSyncError);
      }
      return { student: newStudent, persisted: true };
    } catch (error) {
      console.error('Öğrenci ekleme hatası:', error);
      throw error;
    }
  };

  const updateStudent = async (id: string, updatedStudent: Partial<Student>) => {
    const prevRow = students.find(s => s.id === id);
    const lookupEmail = (prevRow?.email || '').toLowerCase().trim();

    const patch: Record<string, unknown> = {};
    if (updatedStudent.name !== undefined) patch.name = updatedStudent.name;
    if (updatedStudent.email !== undefined) patch.email = updatedStudent.email;
    if (updatedStudent.phone !== undefined) patch.phone = updatedStudent.phone;
    if (updatedStudent.birthDate !== undefined) patch.birth_date = updatedStudent.birthDate;
    if (updatedStudent.classLevel !== undefined)
      patch.class_level = String(updatedStudent.classLevel);
    if (updatedStudent.school !== undefined) patch.school = updatedStudent.school;
    if (updatedStudent.parentName !== undefined) patch.parent_name = updatedStudent.parentName;
    if (updatedStudent.parentPhone !== undefined) patch.parent_phone = updatedStudent.parentPhone;
    // coachId gönderilmediğinde coach_id sıfırlanmasın (|| null her zaman PATCH'e null yazardı).
    if ('coachId' in updatedStudent) patch.coach_id = updatedStudent.coachId || null;
    if ('institutionId' in updatedStudent)
      patch.institution_id = updatedStudent.institutionId || null;
    if (updatedStudent.programId !== undefined) patch.program_id = updatedStudent.programId;

    let saved: ApiStudentRow;
    try {
      saved = await db.updateStudent(id, patch as Parameters<(typeof db)['updateStudent']>[1]);
    } catch (error) {
      console.error('Öğrenci güncelleme hatası:', error);
      throw error;
    }

    const normalized = studentRowToStudent(saved);
    setStudents(prev =>
      prev.map(s => {
        if (s.id !== id) return s;
        return {
          ...normalized,
          groupName: s.groupName,
          password: updatedStudent.password !== undefined ? updatedStudent.password : s.password
        };
      })
    );

    // Öğrenci kullanıcı hesabını da güncelle
    try {
      const pw =
        typeof updatedStudent.password === 'string' &&
        updatedStudent.password.length >= 6
          ? updatedStudent.password
          : undefined;
      const existingUser =
        lookupEmail ? await db.getUserByEmail(lookupEmail) : null;
      const nextMail =
        (updatedStudent.email !== undefined ? updatedStudent.email : prevRow?.email) ||
        '';

      if (existingUser || (nextMail && pw)) {
        const u = existingUser || (await db.getUserByEmail(nextMail.toLowerCase().trim()));
        if (u) {
          const userPatch: Record<string, unknown> = {
            name: updatedStudent.name ?? u.name,
            phone:
              updatedStudent.phone !== undefined
                ? updatedStudent.phone || null
                : u.phone ?? null,
            institution_id: updatedStudent.institutionId ?? u.institution_id
          };
          if (pw) userPatch.password_hash = pw;
          if (
            typeof updatedStudent.email === 'string' &&
            updatedStudent.email.trim().toLowerCase() !== u.email.trim().toLowerCase()
          ) {
            userPatch.email = updatedStudent.email.trim().toLowerCase();
          }
          await db.updateUser(u.id, userPatch as Parameters<(typeof db)['updateUser']>[1]);
        }
      }
    } catch (userSyncError) {
      console.error('Öğrenci kullanıcı güncelleme senkronizasyon hatası:', userSyncError);
    }
  };

  const deleteStudent = async (id: string) => {
    try {
      await db.deleteStudent(id);
    } catch (error) {
      console.error('Öğrenci silme hatası:', error);
    }
    // Update local state
    setStudents(prev => prev.filter(s => s.id !== id));
    setWeeklyEntries(prev => prev.filter(e => e.studentId !== id));
  };

  // Eğitim Koçu işlemleri - Supabase database
  const addCoach = async (coach: Coach) => {
    const resolvedInstitutionId =
      coach.institutionId ||
      activeInstitutionId ||
      institution?.id ||
      loadFromStorage<string | null>(STORAGE_KEYS.activeInstitutionId, null) ||
      institutions[0]?.id ||
      null;
    const preferredRowId = coach.id?.trim() ? coach.id.trim() : undefined;
    await ensureSupabaseReady();

    try {
      const created = await db.createCoach(
        {
          name: coach.name,
          email: coach.email,
          phone: coach.phone,
          specialties: coach.subjects || [],
          student_ids: coach.studentIds || [],
          institution_id: resolvedInstitutionId
        },
        preferredRowId
      );
      // Convert to Coach type and add to state
      const newCoach: Coach = {
        id: created.id,
        name: created.name,
        email: created.email,
        phone: created.phone || undefined,
        subjects: created.specialties || [],
        institutionId: created.institution_id || undefined,
        studentIds: created.student_ids || [],
        createdAt: created.created_at
      };
      setCoaches((prev) => {
        const byId = prev.findIndex((c) => c.id === newCoach.id);
        if (byId !== -1) {
          const next = [...prev];
          next[byId] = newCoach;
          return next;
        }
        const byEmail = prev.findIndex(
          (c) => c.email.toLowerCase().trim() === newCoach.email.toLowerCase().trim()
        );
        if (byEmail !== -1) {
          const next = [...prev];
          next[byEmail] = newCoach;
          return next;
        }
        return [...prev, newCoach];
      });

      // Koç giriş yapabilsin diye users tablosunda da karşılığı olmalı
      try {
        const existingUser = await db.getUserByEmail(coach.email);
        const passwordToSave = coach.password || '123456';

        if (existingUser) {
          await db.updateUser(existingUser.id, {
            name: coach.name,
            phone: coach.phone || null,
            role: 'coach',
            password_hash: passwordToSave,
            institution_id: resolvedInstitutionId,
            is_active: true
          });
        } else {
          await db.createUser({
            email: coach.email.toLowerCase().trim(),
            name: coach.name,
            phone: coach.phone || null,
            role: 'coach',
            password_hash: passwordToSave,
            institution_id: resolvedInstitutionId,
            is_active: true,
            package: 'trial',
            start_date: new Date().toISOString(),
            end_date: null
          });
        }
      } catch (userSyncError) {
        console.error('Koç kullanıcı hesabı senkronizasyon hatası:', userSyncError);
      }
    } catch (error) {
      console.error('Koç ekleme hatası:', error);
      throw error;
    }
  };

  const updateCoach = async (id: string, updatedCoach: Partial<Coach>) => {
    try {
      await db.updateCoach(id, {
        name: updatedCoach.name,
        email: updatedCoach.email,
        phone: updatedCoach.phone,
        specialties: updatedCoach.subjects,
        student_ids: updatedCoach.studentIds
      });
    } catch (error) {
      console.error('Koç güncelleme hatası:', error);
    }
    // Update local state
    setCoaches(prev => prev.map(c => c.id === id ? { ...c, ...updatedCoach } : c));

    // Koç kullanıcı hesabını da güncelle
    try {
      const existingCoach = coaches.find(c => c.id === id);
      const targetEmail = updatedCoach.email || existingCoach?.email;

      if (targetEmail) {
        let existingUser = await db.getUserByEmail(targetEmail);
        if (!existingUser && existingCoach?.email && existingCoach.email !== targetEmail) {
          existingUser = await db.getUserByEmail(existingCoach.email);
        }

        if (existingUser) {
          await db.updateUser(existingUser.id, {
            email: targetEmail.toLowerCase().trim(),
            name: updatedCoach.name || existingUser.name,
            phone: updatedCoach.phone || existingUser.phone,
            role: 'coach',
            password_hash: updatedCoach.password || existingUser.password_hash,
            institution_id: updatedCoach.institutionId || existingUser.institution_id
          });
        }
      }
    } catch (userSyncError) {
      console.error('Koç kullanıcı güncelleme senkronizasyon hatası:', userSyncError);
    }
  };

  const deleteCoach = async (id: string) => {
    const coachToDelete = coaches.find(c => c.id === id);
    try {
      await db.deleteCoach(id);
    } catch (error) {
      console.error('Koç silme hatası:', error);
    }

    // Koç kullanıcı hesabını da temizle
    try {
      if (coachToDelete?.email) {
        const existingUser = await db.getUserByEmail(coachToDelete.email);
        if (existingUser?.role === 'coach') {
          await db.deleteUser(existingUser.id);
        }
      }
    } catch (userSyncError) {
      console.error('Koç kullanıcı silme senkronizasyon hatası:', userSyncError);
    }

    // Update local state
    setCoaches(prev => prev.filter(c => c.id !== id));
    setStudents(prev => prev.map(s => s.coachId === id ? { ...s, coachId: undefined } : s));
  };

  // Haftalık kayıt işlemleri - Supabase database
  const addWeeklyEntry = async (entry: WeeklyEntry) => {
    const studentInstitutionId = students.find(s => s.id === entry.studentId)?.institutionId || null;
    const resolvedInstitutionId = activeInstitutionId || studentInstitutionId || institution?.id || null;
    try {
      const created = await db.createWeeklyEntry({
        student_id: entry.studentId,
        date: entry.date,
        subject: entry.subject,
        topic: entry.topic,
        target_questions: entry.targetQuestions,
        solved_questions: entry.solvedQuestions,
        correct: entry.correctAnswers,
        wrong: entry.wrongAnswers,
        blank: entry.blankAnswers,
        notes: entry.coachComment || null,
        reading_minutes: entry.readingMinutes || null,
        pages_read: entry.pagesRead ?? null,
        screen_time_minutes: entry.screenTimeMinutes ?? null,
        book_id: entry.bookId || null,
        book_title: entry.bookTitle || null,
        institution_id: resolvedInstitutionId
      });
      // Convert and add to state
      const newEntry: WeeklyEntry = {
        id: created.id,
        studentId: created.student_id,
        date: created.date,
        subject: created.subject,
        topic: created.topic,
        targetQuestions: created.target_questions,
        solvedQuestions: created.solved_questions,
        correctAnswers: created.correct,
        wrongAnswers: created.wrong,
        blankAnswers: created.blank,
        coachComment: created.notes || undefined,
        readingMinutes: created.reading_minutes || undefined,
        pagesRead: (created as { pages_read?: number }).pages_read ?? entry.pagesRead,
        screenTimeMinutes: (created as { screen_time_minutes?: number }).screen_time_minutes ?? entry.screenTimeMinutes,
        bookId: created.book_id || undefined,
        bookTitle: created.book_title || undefined,
        createdAt: created.created_at
      };
      setWeeklyEntries(prev => [...prev, newEntry]);
    } catch (error) {
      console.error('Haftalık kayıt ekleme hatası:', error);
      // Fallback
      const newEntry: WeeklyEntry = {
        ...entry,
        id: entry.id || `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
      };
      setWeeklyEntries(prev => [...prev, newEntry]);
    }
  };

  const updateWeeklyEntry = async (id: string, updatedEntry: Partial<WeeklyEntry>) => {
    try {
      await db.updateWeeklyEntry(id, {
        subject: updatedEntry.subject,
        topic: updatedEntry.topic,
        target_questions: updatedEntry.targetQuestions,
        solved_questions: updatedEntry.solvedQuestions,
        correct: updatedEntry.correctAnswers,
        wrong: updatedEntry.wrongAnswers,
        blank: updatedEntry.blankAnswers,
        notes: updatedEntry.coachComment,
        reading_minutes: updatedEntry.readingMinutes,
        pages_read: updatedEntry.pagesRead,
        screen_time_minutes: updatedEntry.screenTimeMinutes,
        book_id: updatedEntry.bookId,
        book_title: updatedEntry.bookTitle
      });
    } catch (error) {
      console.error('Haftalık kayıt güncelleme hatası:', error);
    }
    setWeeklyEntries(prev => prev.map(e => e.id === id ? { ...e, ...updatedEntry } : e));
  };

  const deleteWeeklyEntry = async (id: string) => {
    try {
      await db.deleteWeeklyEntry(id);
    } catch (error) {
      console.error('Haftalık kayıt silme hatası:', error);
    }
    setWeeklyEntries(prev => prev.filter(e => e.id !== id));
  };

  const getStudentEntries = (studentId: string) => {
    return weeklyEntries.filter(e => e.studentId === studentId);
  };

  // Kurum işlemleri - Supabase database
  const addInstitution = async (
    newInstitution: Institution,
    opts?: { plan?: 'starter' | 'professional' | 'enterprise' }
  ): Promise<Institution | null> => {
    try {
      const created = await db.createInstitution({
        name: newInstitution.name,
        email: newInstitution.email,
        phone: newInstitution.phone,
        address: newInstitution.address,
        website: newInstitution.website,
        logo: newInstitution.logo,
        plan: opts?.plan ?? 'professional',
        is_active: newInstitution.isActive
      });
      const newInst: Institution = {
        id: created.id,
        name: created.name,
        email: created.email,
        phone: created.phone || undefined,
        address: created.address || undefined,
        website: created.website || undefined,
        logo: created.logo || undefined,
        isActive: created.is_active,
        createdAt: created.created_at
      };
      setInstitutions(prev => {
        if (prev.some((i) => i.id === newInst.id)) {
          return prev.map((i) => (i.id === newInst.id ? newInst : i));
        }
        return [...prev, newInst];
      });
      return newInst;
    } catch (error) {
      console.error('Kurum ekleme hatası:', error);
      return null;
    }
  };

  const updateInstitution = async (id: string, info: Partial<Institution>) => {
    try {
      await db.updateInstitution(id, {
        name: info.name,
        email: info.email,
        phone: info.phone,
        address: info.address,
        website: info.website,
        logo: info.logo,
        is_active: info.isActive
      });
    } catch (error) {
      console.error('Kurum güncelleme hatası:', error);
    }
    setInstitutions(prev => prev.map(inst =>
      inst.id === id ? { ...inst, ...info } : inst
    ));
  };

  const deleteInstitution = async (id: string) => {
    if (institutions.length <= 1) {
      alert('En az bir kurum olmalıdır!');
      return;
    }
    try {
      await supabase.from('institutions').delete().eq('id', id);
    } catch (error) {
      console.error('Kurum silme hatası:', error);
    }
    setInstitutions(prev => prev.filter(inst => inst.id !== id));
    if (activeInstitutionId === id) {
      const remaining = institutions.find(inst => inst.id !== id);
      setActiveInstitutionId(remaining?.id || null);
    }
  };

  const setActiveInstitution = (id: string) => {
    setActiveInstitutionId(id);
  };

  // Konu havuzu işlemleri
  const getTopics = (subject: string, classLevel: number | string): string[] => {
    // YKS sınıfları için özel işlem
    if (typeof classLevel === 'string' && classLevel.startsWith('YKS-')) {
      // TYT konuları için (TYT TÜRKÇE, TYT MATEMATİK vb.)
      if (subject.startsWith('TYT ')) {
        return customTopics[subject]?.[classLevel] || customTopics[subject]?.['YKS-Sayısal'] || [];
      }
      // AYT konuları için
      return customTopics[subject]?.[classLevel] || [];
    }

    if (customTopics[subject] && customTopics[subject][classLevel]) {
      return customTopics[subject][classLevel];
    }
    return [];
  };

  // Belirli bir sınıfa ait tüm konuları getir
  // YKS öğrencileri için TYT ve AYT olarak ayrı organize eder
  const getTopicsByClass = (classLevel: number | string): {
    regular: Record<string, string[]>;
    tytSubjects: Record<string, string[]>;
    aytSubjects: Record<string, string[]>;
    isYKS: boolean;
  } => {
    const result: Record<string, string[]> = {};
    const tytSubjects: Record<string, string[]> = {};
    const aytSubjects: Record<string, string[]> = {};
    let isYKS = false;

    // YKS sınıfları için özel işlem
    if (typeof classLevel === 'string' && classLevel.startsWith('YKS-')) {
      isYKS = true;

      // TYT konularını al (her ders ayrı bir key'de - TYT TÜRKÇE, TYT MATEMATİK, vb.)
      Object.keys(customTopics).forEach(subject => {
        if (subject.startsWith('TYT ') && customTopics[subject]?.[classLevel]) {
          const subjectName = subject; // 'TYT TÜRKÇE', 'TYT MATEMATİK' vb.
          tytSubjects[subjectName] = customTopics[subject][classLevel];
        }
      });

      // AYT konularını al (her ders ayrı bir key'de)
      Object.keys(customTopics).forEach(subject => {
        if (subject.startsWith('AYT ') && customTopics[subject]?.[classLevel]) {
          const subjectName = subject; // 'AYT MATEMATİK', 'AYT FİZİK' vb.
          aytSubjects[subjectName] = customTopics[subject][classLevel];
        }
      });

      return { regular: result, tytSubjects, aytSubjects, isYKS };
    }

    // Normal sınıflar (9, 10, 11, 12)
    Object.keys(customTopics).forEach(subject => {
      // YKS konularını atlama
      if (subject.startsWith('TYT ') || subject.startsWith('AYT ')) {
        return;
      }
      if (customTopics[subject] && customTopics[subject][classLevel]) {
        result[subject] = customTopics[subject][classLevel];
      }
    });

    return { regular: result, tytSubjects: {}, aytSubjects: {}, isYKS };
  };

  // Konu takibi işlemleri
  const markTopicCompleted = (studentId: string, subject: string, topic: string, entryId?: string) => {
    setTopicProgress(prev => {
      // Aynı konu zaten işaretlenmiş mi kontrol et
      const exists = prev.some(p =>
        p.studentId === studentId && p.subject === subject && p.topic === topic
      );
      if (exists) return prev;

      return [...prev, {
        studentId,
        subject,
        topic,
        completedAt: new Date().toISOString(),
        entryId
      }];
    });
  };

  const unmarkTopicCompleted = (studentId: string, subject: string, topic: string) => {
    setTopicProgress(prev =>
      prev.filter(p => !(p.studentId === studentId && p.subject === subject && p.topic === topic))
    );
  };

  const getStudentTopicProgress = (studentId: string): TopicProgress[] => {
    return topicProgress.filter(p => p.studentId === studentId);
  };

  const getCompletedTopicsBySubject = (studentId: string, subject: string): TopicProgress[] => {
    return topicProgress.filter(p => p.studentId === studentId && p.subject === subject);
  };

  const resetTopicProgress = (studentId: string) => {
    setTopicProgress(prev => prev.filter(p => p.studentId !== studentId));
  };

  const addTopic = (subject: string, classLevel: number | string, topic: string) => {
    setCustomTopics(prev => {
      const updated = { ...prev };
      if (!updated[subject]) {
        updated[subject] = { [classLevel]: [] };
      } else if (!updated[subject][classLevel]) {
        updated[subject] = { ...updated[subject], [classLevel]: [] };
      }
      if (!updated[subject][classLevel].includes(topic)) {
        updated[subject][classLevel] = [...updated[subject][classLevel], topic];
      }
      return updated;
    });
  };

  // İstatistik hesaplama
  const getStudentStats = (studentId: string) => {
    const entries = getStudentEntries(studentId);

    if (entries.length === 0) {
      return {
        totalTarget: 0,
        totalSolved: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalBlank: 0,
        realizationRate: 0,
        successRate: 0,
        totalReadingMinutes: 0
      };
    }

    const totalTarget = entries.reduce((sum, e) => sum + e.targetQuestions, 0);
    const totalSolved = entries.reduce((sum, e) => sum + e.solvedQuestions, 0);
    const totalCorrect = entries.reduce((sum, e) => sum + e.correctAnswers, 0);
    const totalWrong = entries.reduce((sum, e) => sum + e.wrongAnswers, 0);
    const totalBlank = entries.reduce((sum, e) => sum + e.blankAnswers, 0);
    const totalReadingMinutes = entries.reduce((sum, e) => sum + (e.readingMinutes || 0), 0);

    const realizationRate = totalTarget > 0 ? Math.round((totalSolved / totalTarget) * 100) : 0;
    const successRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;

    return {
      totalTarget,
      totalSolved,
      totalCorrect,
      totalWrong,
      totalBlank,
      realizationRate,
      successRate,
      totalReadingMinutes
    };
  };

  // Deneme Sınavı işlemleri
  const addExamResult = (exam: ExamResult) => {
    setExamResults(prev => [...prev, exam]);
  };

  const updateExamResult = (id: string, updatedExam: Partial<ExamResult>) => {
    setExamResults(prev => prev.map(e => e.id === id ? { ...e, ...updatedExam } : e));
  };

  const deleteExamResult = (id: string) => {
    setExamResults(prev => prev.filter(e => e.id !== id));
  };

  const getStudentExamResults = (studentId: string) => {
    return examResults
      .filter(e => e.studentId === studentId)
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  };

  const getLatestExamResult = (studentId: string) => {
    const results = getStudentExamResults(studentId);
    return results.length > 0 ? results[0] : null;
  };

  // AI Koç Öneri işlemleri
  const addAISuggestion = (suggestion: AICoachSuggestion) => {
    setAISuggestions(prev => [...prev, suggestion]);
  };

  const markSuggestionRead = (id: string) => {
    setAISuggestions(prev => prev.map(s => s.id === id ? { ...s, isRead: true } : s));
  };

  const deleteAISuggestion = (id: string) => {
    setAISuggestions(prev => prev.filter(s => s.id !== id));
  };

  const getStudentAISuggestions = (studentId: string) => {
    return aiSuggestions
      .filter(s => s.studentId === studentId)
      .sort((a, b) => {
        // Önce okunmamışları göster
        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
        // Sonra önceliğe göre
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  };

  // AI Öneri oluşturma (otomatik analiz)
  const generateAISuggestions = (studentId: string) => {
    const suggestions: AICoachSuggestion[] = [];

    // Haftalık verilerden analiz
    const entries = getStudentEntries(studentId);
    if (entries.length > 0) {
      const stats = getStudentStats(studentId);

      // Başarı oranı düşükse
      if (stats.successRate < 60) {
        suggestions.push({
          id: `weekly-${studentId}-${Date.now()}`,
          studentId,
          type: 'warning',
          priority: 'high',
          title: 'Düşük Başarı Oranı',
          description: `${stats.successRate}% başarı oranı ile hedeflediğiniz seviyeye ulaşmak için daha fazla çalışmanız gerekiyor. Zayıf konulara odaklanın.`,
          source: 'weekly',
          createdAt: new Date().toISOString(),
          isRead: false
        });
      }

      // Gerçekleşme oranı düşükse
      if (stats.realizationRate < 80) {
        suggestions.push({
          id: `weekly-real-${studentId}-${Date.now()}`,
          studentId,
          type: 'improvement',
          priority: 'medium',
          title: 'Hedef Gerçekleştirme',
          description: `${stats.totalTarget - stats.totalSolved} adet soru hedefinizi tamamlamadınız. Düzenli çalışma ile hedeflerinize ulaşabilirsiniz.`,
          source: 'weekly',
          createdAt: new Date().toISOString(),
          isRead: false
        });
      }
    }

    // Deneme sınavlarından analiz
    const examResult = getLatestExamResult(studentId);
    if (examResult) {
      // En düşük ders kontrolü
      const worstSubject = examResult.subjects.reduce((worst, current) =>
        current.net < worst.net ? current : worst
      , examResult.subjects[0]);

      if (worstSubject && worstSubject.net < 3) {
        suggestions.push({
          id: `exam-${studentId}-${Date.now()}`,
          studentId,
          type: 'warning',
          priority: 'high',
          title: `${worstSubject.name} Konusunda Dikkat`,
          description: `${examResult.examType} sınavında ${worstSubject.name} dersinde sadece ${worstSubject.net} net yaptınız. Bu konuda ek çalışma yapmanız önerilir.`,
          source: 'exam',
          createdAt: new Date().toISOString(),
          isRead: false
        });
      }

      // İyileşme varsa
      const previousResults = getStudentExamResults(studentId);
      if (previousResults.length > 1) {
        const previous = previousResults[1];
        if (examResult.totalNet > previous.totalNet) {
          suggestions.push({
            id: `exam-success-${studentId}-${Date.now()}`,
            studentId,
            type: 'success',
            priority: 'low',
            title: 'İyileşme Var!',
            description: `${examResult.examType} sınavında ${previous.totalNet} netten ${examResult.totalNet} nete yükseldiniz. Devam edin!`,
            source: 'exam',
            createdAt: new Date().toISOString(),
            isRead: false
          });
        }
      }
    }

    // Konu takibinden analiz
    const completedTopics = getStudentTopicProgress(studentId);
    if (completedTopics.length >= 5) {
      suggestions.push({
        id: `topic-${studentId}-${Date.now()}`,
        studentId,
        type: 'tip',
        priority: 'low',
        title: 'Konu Takibi İyi',
        description: `${completedTopics.length} konuyu tamamladınız. Tüm konuları bitirdiğinizden emin olun ve bol tekrar yapın.`,
        source: 'topic',
        createdAt: new Date().toISOString(),
        isRead: false
      });
    }

    // Yeni önerileri ekle
    suggestions.forEach(s => {
      // Aynı öneri var mı kontrol et
      const exists = aiSuggestions.some(existing =>
        existing.studentId === studentId &&
        existing.title === s.title &&
        !existing.isRead
      );
      if (!exists) {
        addAISuggestion(s);
      }
    });
  };

  // ============ KİTAP OKUMA TAKİBİ FONKSİYONLARI ============

  // Kitap işlemleri - Supabase database
  const addBook = async (book: Book) => {
    try {
      const created = await db.createBookReading({
        student_id: book.studentId,
        book_title: book.title,
        author: book.author || null,
        pages_read: book.pagesRead,
        start_date: book.startDate || null,
        end_date: book.endDate || null,
        notes: book.notes || null,
        institution_id: activeInstitutionId || null
      });
      // Convert and add to state
      const newBook: Book = {
        id: created.id,
        studentId: created.student_id,
        title: created.book_title,
        author: created.author || undefined,
        pagesRead: created.pages_read,
        startDate: created.start_date || '',
        endDate: created.end_date || undefined,
        status: 'reading',
        notes: created.notes || undefined,
        institutionId: created.institution_id || undefined,
        createdAt: created.created_at
      };
      setBooks(prev => [...prev, newBook]);
    } catch (error) {
      console.error('Kitap ekleme hatası:', error);
      // Fallback
      const newBook: Book = {
        ...book,
        id: book.id || `book-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
      };
      setBooks(prev => [...prev, newBook]);
    }
  };

  const updateBook = async (id: string, updatedBook: Partial<Book>) => {
    try {
      await db.updateBookReading(id, {
        book_title: updatedBook.title,
        author: updatedBook.author,
        pages_read: updatedBook.pagesRead,
        end_date: updatedBook.endDate,
        notes: updatedBook.notes
      });
    } catch (error) {
      console.error('Kitap güncelleme hatası:', error);
    }
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...updatedBook } : b));
  };

  const deleteBook = async (id: string) => {
    try {
      await db.deleteBookReading(id);
    } catch (error) {
      console.error('Kitap silme hatası:', error);
    }
    setBooks(prev => prev.filter(b => b.id !== id));
  };

  const getStudentBooks = (studentId: string) => {
    return books
      .filter(b => b.studentId === studentId)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  };

  // Okuma kaydı işlemleri
  const addReadingLog = (log: ReadingLog) => {
    setReadingLogs(prev => [...prev, log]);
  };

  const updateReadingLog = (id: string, updatedLog: Partial<ReadingLog>) => {
    setReadingLogs(prev => prev.map(l => l.id === id ? { ...l, ...updatedLog } : l));
  };

  const deleteReadingLog = (id: string) => {
    setReadingLogs(prev => prev.filter(l => l.id !== id));
  };

  const getStudentReadingLogs = (studentId: string) => {
    return readingLogs
      .filter(l => l.studentId === studentId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  /** Bir okuma kaydındaki sayfa miktarı (legacy: `minutesRead` / DB `reading_minutes` artık sayfa olarak kullanılıyor). */
  const readingPagesFromLog = (l: ReadingLog): number => {
    const n = l.pagesRead ?? l.minutesRead ?? 0;
    return typeof n === 'number' && !Number.isNaN(n) ? Math.max(0, n) : 0;
  };

  // Haftalık takip + manuel log birleşik okuma verisi
  const getUnifiedReadingLogs = (studentId: string) => {
    const directLogs = getStudentReadingLogs(studentId);
    const weeklyReadingLogs: ReadingLog[] = weeklyEntries
      .filter(e => e.studentId === studentId && (e.readingMinutes || 0) > 0)
      .map(e => ({
        id: `weekly-${e.id}`,
        studentId,
        bookId: e.bookId,
        date: e.date,
        minutesRead: e.readingMinutes || 0,
        // Haftalık Takip'te bu alan artık "okunan sayfa" olarak kullanılıyor.
        pagesRead: e.readingMinutes || 0,
        notes: e.bookTitle ? `Haftalik Kayit: ${e.bookTitle}` : 'Haftalik Kayit',
        createdAt: e.createdAt
      }));

    return [...directLogs, ...weeklyReadingLogs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  };

  // Kitaba ait toplam okunan sayfa (legacy alan adları)
  const getBookReadingTime = (bookId: string) => {
    const fromLogs = readingLogs
      .filter(l => l.bookId === bookId)
      .reduce((sum, l) => sum + readingPagesFromLog(l), 0);
    const fromWeekly = weeklyEntries
      .filter(e => e.bookId === bookId && (e.readingMinutes || 0) > 0)
      .reduce((sum, e) => sum + (e.readingMinutes || 0), 0);
    return fromLogs + fromWeekly;
  };

  // Okuma istatistikleri
  const getReadingStats = (studentId: string): ReadingStats => {
    const studentLogs = getUnifiedReadingLogs(studentId);
    const studentBooks = getStudentBooks(studentId);
    const completedBooks = studentBooks.filter(b => b.status === 'completed');

    const totalMinutes = studentLogs.reduce((sum, l) => sum + readingPagesFromLog(l), 0);

    // Ortalama günlük sayfa (son 30 güne yayılır; aktif gün sayısı değil, sabit 30)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentLogs = studentLogs.filter(l => new Date(l.date) >= thirtyDaysAgo);
    const averageDailyMinutes = recentLogs.length > 0
      ? Math.round(recentLogs.reduce((sum, l) => sum + readingPagesFromLog(l), 0) / 30)
      : 0;

    // En çok okunan kitap
    const bookMinutes: Record<string, number> = {};
    studentLogs.forEach(log => {
      if (log.bookId) {
        bookMinutes[log.bookId] = (bookMinutes[log.bookId] || 0) + readingPagesFromLog(log);
      }
    });
    let mostReadBook: string | undefined;
    let maxMinutes = 0;
    Object.entries(bookMinutes).forEach(([bookId, minutes]) => {
      if (minutes > maxMinutes) {
        maxMinutes = minutes;
        mostReadBook = bookId;
      }
    });
    const mostReadBookTitle = mostReadBook
      ? studentBooks.find(b => b.id === mostReadBook)?.title
      : undefined;

    return {
      totalMinutes,
      totalBooks: studentBooks.length,
      completedBooks: completedBooks.length,
      averageDailyMinutes,
      readingStreak: getCurrentStreak(studentId),
      mostReadBook: mostReadBookTitle,
      longestStreak: getLongestStreak(studentId)
    };
  };

  // Mevcut okuma serisi (ardışık gün sayısı)
  const getCurrentStreak = (studentId: string) => {
    const studentLogs = getUnifiedReadingLogs(studentId);
    if (studentLogs.length === 0) return 0;

    // Benzersiz tarihleri al
    const uniqueDates = [...new Set(studentLogs.map(l => l.date))].sort().reverse();
    if (uniqueDates.length === 0) return 0;

    // Bugün veya dün okuma yapılmış mı kontrol et
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterdayStr) {
      return 0; // Seri kırıldı
    }

    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const current = new Date(uniqueDates[i - 1]);
      const prev = new Date(uniqueDates[i]);
      const diffDays = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  };

  // En uzun okuma serisi
  const getLongestStreak = (studentId: string) => {
    const studentLogs = getUnifiedReadingLogs(studentId);
    if (studentLogs.length === 0) return 0;

    const uniqueDates = [...new Set(studentLogs.map(l => l.date))].sort();
    if (uniqueDates.length === 0) return 0;

    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
      const current = new Date(uniqueDates[i]);
      const prev = new Date(uniqueDates[i - 1]);
      const diffDays = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return maxStreak;
  };

  // Isı haritası verisi (belirli ay için)
  const getReadingHeatmap = (studentId: string, year: number, month: number) => {
    const studentLogs = getUnifiedReadingLogs(studentId);
    const heatmap: Record<string, number> = {};

    studentLogs
      .filter(l => {
        const date = new Date(l.date);
        return date.getFullYear() === year && date.getMonth() === month;
      })
      .forEach(l => {
        const day = l.date.split('-')[2];
        heatmap[day] = (heatmap[day] || 0) + readingPagesFromLog(l);
      });

    return heatmap;
  };

  // AI okuma yorumları
  const getReadingComments = (studentId: string) => {
    const comments: { type: string; title: string; description: string }[] = [];
    const stats = getReadingStats(studentId);

    // Seri kırıldı uyarısı
    if (stats.readingStreak === 0) {
      const logs = getStudentReadingLogs(studentId);
      const unifiedLogs = getUnifiedReadingLogs(studentId);
      if (unifiedLogs.length > 0) {
        const lastReadDate = new Date(unifiedLogs[0].date);
        const today = new Date();
        const daysSince = Math.floor((today.getTime() - lastReadDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > 1) {
          comments.push({
            type: 'warning',
            title: 'Okuma Serisi Kırıldı',
            description: `${daysSince} gündür okuma yapılmadı. Bugün okumaya başlayarak seriyi yeniden başlatabilirsin!`
          });
        }
      }
    } else if (stats.readingStreak >= 7) {
      comments.push({
        type: 'success',
        title: 'Harika Seri!',
        description: `${stats.readingStreak} gündür üst üste okuma yapıyorsun! Bu harika bir alışkanlık.`
      });
    }

    // Düşük okuma uyarısı (ortalama günlük sayfa, son 30 gün)
    if (stats.averageDailyMinutes < 15 && stats.totalMinutes > 0) {
      comments.push({
        type: 'improvement',
        title: 'Okuma Miktarı Arttırılabilir',
        description: `Günlük ortalama ${stats.averageDailyMinutes} sayfa okuyorsun. Hedefin günde en az 20 sayfa olabilir.`
      });
    }

    // Yüksek performans
    if (stats.averageDailyMinutes >= 35) {
      comments.push({
        type: 'success',
        title: 'Mükemmel Okuma Alışkanlığı!',
        description: `Günde ortalama ${stats.averageDailyMinutes} sayfa okuyorsun. Bu harika bir performans!`
      });
    }

    // Kitap tamamlama
    if (stats.completedBooks >= 1 && stats.completedBooks < 3) {
      comments.push({
        type: 'tip',
        title: 'İlk Kitap Tamamlandı!',
        description: `${stats.completedBooks} kitap bitirdin! Seri kitaplar okuyarak okuma alışkanlığını güçlendirebilirsin.`
      });
    }

    return comments;
  };

  // Rozet durumu - Okuma rozetleri (static data)
  const READING_BADGES = [
    { id: 'first-book', name: 'İlk Adım', icon: '📖', description: 'İlk kitabını bitir', requirement: { type: 'books' as const, value: 1 } },
    { id: 'five-books', name: 'Kitap Kurdu', icon: '📚', description: '5 kitap bitir', requirement: { type: 'books' as const, value: 5 } },
    { id: 'ten-books', name: 'Süper Okuyucu', icon: '🏆', description: '10 kitap bitir', requirement: { type: 'books' as const, value: 10 } },
    { id: 'streak-7', name: 'Haftalık Seri', icon: '🔥', description: '7 gün üst üste oku', requirement: { type: 'streak' as const, value: 7 } },
    { id: 'streak-30', name: 'Aylık Seri', icon: '⭐', description: '30 gün üst üste oku', requirement: { type: 'streak' as const, value: 30 } },
    { id: 'minutes-100', name: '100 Sayfa', icon: '⏱️', description: '100 sayfa oku', requirement: { type: 'minutes' as const, value: 100 } },
    { id: 'minutes-500', name: '500 Sayfa', icon: '⏰', description: '500 sayfa oku', requirement: { type: 'minutes' as const, value: 500 } },
    { id: 'minutes-1000', name: '1000 Sayfa', icon: '🎯', description: '1000 sayfa oku', requirement: { type: 'minutes' as const, value: 1000 } },
  ];

  const getReadingBadges = (studentId: string) => {
    const stats = getReadingStats(studentId);
    const completedBooks = getStudentBooks(studentId).filter(b => b.status === 'completed');

    return READING_BADGES.map(badge => {
      let earned = false;

      switch (badge.requirement.type) {
        case 'books':
          earned = completedBooks.length >= badge.requirement.value;
          break;
        case 'streak':
          earned = stats.longestStreak >= badge.requirement.value;
          break;
        case 'minutes':
          earned = stats.totalMinutes >= badge.requirement.value;
          break;
        case 'days': {
          const uniqueDays = new Set(readingLogs.filter(l => l.studentId === studentId).map(l => l.date)).size;
          earned = uniqueDays >= badge.requirement.value;
          break;
        }
      }

      return {
        id: badge.id,
        name: badge.name,
        icon: badge.icon,
        description: badge.description,
        earned
      };
    });
  };

  // ============ YAZILI TAKİBİ FONKSİYONLARI ============

  // Seçili öğrenci state
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  /** Öğrenci rolü (veya taklit): tek kart — API linkedStudent veya effectiveUser.studentId */
  useEffect(() => {
    if (effectiveUser?.role !== 'student') return;
    const sid = linkedStudent?.id ?? effectiveUser?.studentId ?? null;
    setSelectedStudentId(sid);
  }, [effectiveUser?.role, effectiveUser?.studentId, linkedStudent?.id]);

  // Yazılı sınav notları state - Gerçek database'den yüklenecek
  const [writtenExamScores, setWrittenExamScores] = useState<WrittenExamScore[]>([]);

  // Yazılı sınav dersleri state (admin ekleyebilir/sileyebilir) - localStorage'da tutulabilir
  const [writtenExamSubjects, setWrittenExamSubjects] = useState<string[]>(() =>
    loadFromStorage(STORAGE_KEYS.writtenExamSubjects, DEFAULT_WRITTEN_EXAM_SUBJECTS)
  );

  const [writtenExamSubjectsByStudent, setWrittenExamSubjectsByStudent] = useState<
    Record<string, string[]>
  >(() => loadFromStorage<Record<string, string[]>>(STORAGE_KEYS.writtenExamSubjectsByStudent, {}));

  // Yazılı sınav verisini localStorage'a kaydet
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.writtenExamScores, writtenExamScores);
  }, [writtenExamScores]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.writtenExamSubjects, writtenExamSubjects);
  }, [writtenExamSubjects]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.writtenExamSubjectsByStudent, writtenExamSubjectsByStudent);
  }, [writtenExamSubjectsByStudent]);

  // Yazılı not ekle - Supabase database
  const addWrittenExamScore = async (score: WrittenExamScore) => {
    try {
      // Check if same exam exists (same student, subject, semester, examType)
      const existing = writtenExamScores.find(
        s => s.studentId === score.studentId && s.subject === score.subject && s.semester === score.semester && s.examType === score.examType
      );

      if (existing) {
        // Update existing
        await db.updateWrittenExam(existing.id, {
          score: score.score,
          date: score.date,
          notes: score.notes
        });
        setWrittenExamScores(prev => prev.map(s => s.id === existing.id ? score : s));
      } else {
        // Create new
        const created = await db.createWrittenExam({
          student_id: score.studentId,
          subject: score.subject,
          semester: score.semester,
          exam_type: score.examType,
          score: score.score,
          date: score.date || null,
          notes: score.notes || null,
          institution_id: activeInstitutionId || null
        });
        // Convert and add to state
        const newScore: WrittenExamScore = {
          id: created.id,
          studentId: created.student_id,
          subject: created.subject,
          semester: created.semester,
          examType: created.exam_type,
          score: created.score,
          date: created.date || new Date().toISOString().split('T')[0],
          notes: created.notes || undefined,
          createdAt: created.created_at
        };
        setWrittenExamScores(prev => [...prev, newScore]);
      }
    } catch (error) {
      console.error('Yazılı not ekleme hatası:', error);
      // Fallback - just update local state
      const existingIndex = writtenExamScores.findIndex(
        s => s.studentId === score.studentId && s.subject === score.subject && s.semester === score.semester && s.examType === score.examType
      );
      if (existingIndex >= 0) {
        setWrittenExamScores(prev => prev.map((s, i) => i === existingIndex ? score : s));
      } else {
        const newScore: WrittenExamScore = {
          ...score,
          id: score.id || `exam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString()
        };
        setWrittenExamScores(prev => [...prev, newScore]);
      }
    }
  };

  // Yazılı not güncelle
  const updateWrittenExamScore = async (id: string, score: Partial<WrittenExamScore>) => {
    try {
      await db.updateWrittenExam(id, {
        score: score.score,
        date: score.date,
        notes: score.notes
      });
    } catch (error) {
      console.error('Yazılı not güncelleme hatası:', error);
    }
    setWrittenExamScores(prev => prev.map(s => s.id === id ? { ...s, ...score } : s));
  };

  // Yazılı not sil
  const deleteWrittenExamScore = async (id: string) => {
    try {
      await db.deleteWrittenExam(id);
    } catch (error) {
      console.error('Yazılı not silme hatası:', error);
    }
    setWrittenExamScores(prev => prev.filter(s => s.id !== id));
  };

  // Öğrencinin yazılı notlarını getir
  const getStudentWrittenExamScores = (studentId: string) => {
    return writtenExamScores.filter(s => s.studentId === studentId);
  };

  // Belirli bir öğrenci ve ders için notları getir
  const getSubjectScores = (studentId: string, subject: string) => {
    return writtenExamScores.filter(s => s.studentId === studentId && s.subject === subject);
  };

  // Dönem ortalamasını hesapla
  const calculateSemesterAverage = (studentId: string, subject: string, semester: 1 | 2): number => {
    const scores = getSubjectScores(studentId, subject);
    // semester alanını kullanarak filtrele
    const semesterScores = scores.filter(s => s.semester === semester);

    if (semesterScores.length === 0) return 0;
    return Math.round(semesterScores.reduce((sum, s) => sum + s.score, 0) / semesterScores.length);
  };

  // Yıl sonu ortalamasını hesapla
  const calculateYearlyAverage = (studentId: string, subject: string): number => {
    const sem1 = calculateSemesterAverage(studentId, subject, 1);
    const sem2 = calculateSemesterAverage(studentId, subject, 2);

    if (sem1 === 0 && sem2 === 0) return 0;
    if (sem1 === 0) return sem2;
    if (sem2 === 0) return sem1;

    return Math.round((sem1 + sem2) / 2);
  };

  // Genel ortalama (tüm dersler)
  const calculateOverallAverage = (studentId: string): number => {
    const studentScores = getStudentWrittenExamScores(studentId);
    if (studentScores.length === 0) return 0;

    // Her ders için sadece en son notları al (dönem ortalamaları)
    const subjects = [...new Set(studentScores.map(s => s.subject))];
    const averages = subjects.map(subject => {
      return calculateYearlyAverage(studentId, subject);
    }).filter(avg => avg > 0);

    if (averages.length === 0) return 0;
    return Math.round(averages.reduce((sum, avg) => sum + avg, 0) / averages.length);
  };

  // Yazılı istatistiklerini getir
  const getWrittenExamStats = (studentId: string): WrittenExamStats => {
    const scores = getStudentWrittenExamScores(studentId);

    if (scores.length === 0) {
      return {
        totalExams: 0,
        averageScore: 0,
        semester1Average: 0,
        semester2Average: 0,
        yearlyAverage: 0,
        bestSubject: '-',
        worstSubject: '-',
        subjectsAbove85: [],
        subjectsBelow70: [],
        improvement: 0,
        totalImprovement: 0
      };
    }

    const subjects = [...new Set(scores.map(s => s.subject))];

    // Her ders için dönem ortalamaları
    const subjectAverages = subjects.map(subject => ({
      subject,
      sem1: calculateSemesterAverage(studentId, subject, 1),
      sem2: calculateSemesterAverage(studentId, subject, 2),
      yearly: calculateYearlyAverage(studentId, subject)
    }));

    // En iyi ve en kötü ders
    const sortedByYearly = [...subjectAverages].filter(s => s.yearly > 0).sort((a, b) => b.yearly - a.yearly);
    const bestSubject = sortedByYearly[0]?.subject || '-';
    const worstSubject = sortedByYearly[sortedByYearly.length - 1]?.subject || '-';

    // 85 üzeri ve 70 altı dersler
    const subjectsAbove85 = subjectAverages.filter(s => s.yearly >= 85).map(s => s.subject);
    const subjectsBelow70 = subjectAverages.filter(s => s.yearly > 0 && s.yearly < 70).map(s => s.subject);

    // Ortalamalar
    const averageScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
    const semester1Average = Math.round(subjectAverages.reduce((sum, s) => sum + s.sem1, 0) / subjectAverages.filter(s => s.sem1 > 0).length || 0);
    const semester2Average = Math.round(subjectAverages.reduce((sum, s) => sum + s.sem2, 0) / subjectAverages.filter(s => s.sem2 > 0).length || 0);
    const yearlyAverage = Math.round(subjectAverages.reduce((sum, s) => sum + s.yearly, 0) / subjectAverages.filter(s => s.yearly > 0).length || 0);

    // Dönem iyileşmesi
    const improvement = semester1Average > 0 && semester2Average > 0
      ? Math.round(((semester2Average - semester1Average) / semester1Average) * 100)
      : 0;

    // İlk girişten şimdiye toplam iyileşme
    const firstScores = scores.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const totalImprovement = firstScores.length > 1
      ? Math.round(((scores[scores.length - 1].score - firstScores[0].score) / firstScores[0].score) * 100)
      : 0;

    return {
      totalExams: scores.length,
      averageScore,
      semester1Average,
      semester2Average,
      yearlyAverage,
      bestSubject,
      worstSubject,
      subjectsAbove85,
      subjectsBelow70,
      improvement,
      totalImprovement
    };
  };

  // Varsayılan şablon dersleri (genel liste)
  const addWrittenExamSubject = (subject: string) => {
    const t = subject.trim();
    if (!t || writtenExamSubjects.includes(t)) return;
    setWrittenExamSubjects(prev => [...prev, t]);
  };

  const removeWrittenExamSubject = (subject: string) => {
    setWrittenExamSubjects(prev => prev.filter(s => s !== subject));
  };

  const getWrittenExamSubjectsForStudent = (studentId: string): string[] => {
    /** Anahtar yoksa genel şablon; `[]` ise bilinçli boş liste (varsayılanlara düşme). */
    if (!Object.prototype.hasOwnProperty.call(writtenExamSubjectsByStudent, studentId)) {
      return [...writtenExamSubjects];
    }
    const custom = writtenExamSubjectsByStudent[studentId];
    const arr = Array.isArray(custom) ? custom : [];
    return [...new Set(arr.map(s => String(s).trim()).filter(Boolean))];
  };

  const addWrittenExamSubjectForStudent = (studentId: string, subject: string) => {
    const t = subject.trim();
    if (!t) return;
    const cur = getWrittenExamSubjectsForStudent(studentId);
    if (cur.includes(t)) return;
    setWrittenExamSubjectsByStudent(prev => ({
      ...prev,
      [studentId]: [...cur, t]
    }));
  };

  const removeWrittenExamSubjectForStudent = async (studentId: string, subject: string) => {
    const trimmed = subject.trim();
    if (!trimmed) return;
    const cur = getWrittenExamSubjectsForStudent(studentId);
    setWrittenExamSubjectsByStudent(prev => ({
      ...prev,
      [studentId]: cur.filter(s => s !== trimmed)
    }));
    const ids = writtenExamScores
      .filter(s => s.studentId === studentId && String(s.subject).trim() === trimmed)
      .map(s => s.id);
    for (const id of ids) {
      await deleteWrittenExamScore(id);
    }
  };

  // AI yazılı yorumları
  const getWrittenExamComments = (studentId: string): WrittenExamComment[] => {
    const comments: WrittenExamComment[] = [];
    const stats = getWrittenExamStats(studentId);

    if (stats.totalExams === 0) return comments;

    // En iyi ders
    if (stats.bestSubject !== '-') {
      comments.push({
        id: `written-best-${studentId}`,
        studentId,
        type: 'success',
        priority: 'low',
        title: `${stats.bestSubject} Dersinde Başarılı`,
        description: `${stats.bestSubject} dersinde yıl sonu ortalamanız ${stats.yearlyAverage > 0 ? stats.yearlyAverage : 'yüksek'}. Bu performansınızı koruyun!`,
        subject: stats.bestSubject,
        createdAt: new Date().toISOString()
      });
    }

    // Geliştirilmesi gereken dersler
    stats.subjectsBelow70.forEach(subject => {
      comments.push({
        id: `written-low-${studentId}-${subject}`,
        studentId,
        type: 'warning',
        priority: 'high',
        title: `${subject} Dersinde Çalışma Gerekli`,
        description: `${subject} dersinde ortalamanız 70'in altında. Bu derste daha fazla soru çözmeniz önerilir.`,
        subject,
        createdAt: new Date().toISOString()
      });
    });

    // Dönem iyileşmesi
    if (stats.improvement > 0) {
      comments.push({
        id: `written-improvement-${studentId}`,
        studentId,
        type: 'improvement',
        priority: 'medium',
        title: 'Dönem İçinde İyileşme Var',
        description: `2. dönemde 1. döneme göre %${stats.improvement} oranında iyileşme gösterdiniz. Bu güzel bir gelişim!`,
        createdAt: new Date().toISOString()
      });
    } else if (stats.improvement < -5) {
      comments.push({
        id: `written-decline-${studentId}`,
        studentId,
        type: 'warning',
        priority: 'medium',
        title: 'Dönem İçinde Düşüş Var',
        description: `2. dönemde 1. döneme göre %${Math.abs(stats.improvement)} oranında düşüş var. Bu derslerde daha fazla çalışmanız önerilir.`,
        createdAt: new Date().toISOString()
      });
    }

    return comments;
  };

  const scopedStudents = React.useMemo(() => {
    if (!effectiveUser) return [];
    const tags = userRoleTags(effectiveUser);
    if (tags.includes('super_admin')) return students;
    if (tags.includes('student')) {
      const sid = resolveStudentRecordId(
        effectiveUser.role,
        effectiveUser.studentId,
        effectiveUser.email,
        students
      );
      if (!sid) return [];
      const matched = students.filter((s) => s.id === sid);
      if (matched.length > 0) return matched;
      return [
        {
          id: sid,
          name: effectiveUser.name?.trim() || 'Öğrenci',
          email: String(effectiveUser.email || 'student@placeholder.local').trim().toLowerCase(),
          phone: '',
          parentPhone: '',
          classLevel: 9,
          institutionId: effectiveUser.institutionId,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    /** Koç: salt kurum admin listesinden önce — admin+koç birlikte olsa dar liste */
    if (tags.includes('coach')) {
      const cid = resolveCoachRecordId(
        effectiveUser.role,
        effectiveUser.coachId,
        effectiveUser.email,
        coaches
      );
      if (!cid) return [];
      return students.filter((s) => String(s.coachId || '') === String(cid));
    }
    /** Öğretmen: API dar liste döner; admin+öğretmen birlikte kurum geneli gösterme */
    if (tags.includes('teacher')) {
      return students;
    }
    if (tags.includes('admin')) {
      return students.filter((s) => s.institutionId === effectiveUser.institutionId);
    }
    return students;
  }, [students, effectiveUser, coaches]);

  const scopedCoaches = React.useMemo(() => {
    if (!effectiveUser) return [];
    const tags = userRoleTags(effectiveUser);
    if (tags.includes('super_admin')) return coaches;
    if (tags.includes('admin')) {
      const iid = effectiveUser.institutionId;
      if (!iid) return coaches;
      // Eski içe aktarımlar: institution_id boş koçlar kurum filtresinde kaybolmasın
      return coaches.filter((c) => !c.institutionId || c.institutionId === iid);
    }
    if (tags.includes('coach')) {
      const cid = resolveCoachRecordId(
        effectiveUser.role,
        effectiveUser.coachId,
        effectiveUser.email,
        coaches
      );
      if (!cid) return [];
      return coaches.filter((c) => c.id === cid);
    }
    if (tags.includes('teacher')) {
      const coachIds = new Set(scopedStudents.map((s) => s.coachId).filter(Boolean));
      if (!coachIds.size) return [];
      return coaches.filter((c) => coachIds.has(c.id));
    }
    return [];
  }, [coaches, effectiveUser, scopedStudents]);

  const scopedWeeklyEntries = React.useMemo(() => {
    if (!effectiveUser) return [];
    const tags = userRoleTags(effectiveUser);
    if (tags.includes('super_admin')) return weeklyEntries;
    if (tags.includes('admin') || tags.includes('teacher')) {
      const allowedStudentIds = new Set(scopedStudents.map((s) => s.id));
      return weeklyEntries.filter((e) => allowedStudentIds.has(e.studentId));
    }
    if (tags.includes('coach')) {
      const allowedStudentIds = new Set(scopedStudents.map((s) => s.id));
      return weeklyEntries.filter((e) => allowedStudentIds.has(e.studentId));
    }
    if (tags.includes('student')) {
      const sid = resolveStudentRecordId(
        effectiveUser.role,
        effectiveUser.studentId,
        effectiveUser.email,
        students
      );
      if (!sid) return [];
      return weeklyEntries.filter((e) => e.studentId === sid);
    }
    return [];
  }, [weeklyEntries, effectiveUser, scopedStudents, students]);

  const scopedInstitutions = React.useMemo(() => {
    if (!effectiveUser) return [];
    if (effectiveUser.role === 'super_admin') return institutions;
    return institutions.filter(i => i.id === effectiveUser.institutionId);
  }, [institutions, effectiveUser]);

  return (
    <AppContext.Provider value={{
      currentUser,
      setCurrentUser,
      userRole,
      setUserRole,
      students: scopedStudents,
      addStudent,
      updateStudent,
      deleteStudent,
      coaches: scopedCoaches,
      addCoach,
      updateCoach,
      deleteCoach,
      weeklyEntries: scopedWeeklyEntries,
      addWeeklyEntry,
      updateWeeklyEntry,
      deleteWeeklyEntry,
      getStudentEntries,
      institutions: scopedInstitutions,
      addInstitution,
      updateInstitution,
      deleteInstitution,
      setActiveInstitution,
      institution,
      activeInstitutionId,
      getTopics,
      addTopic,
      getTopicsByClass,
      topicProgress,
      markTopicCompleted,
      unmarkTopicCompleted,
      getStudentTopicProgress,
      getCompletedTopicsBySubject,
      resetTopicProgress,
      getStudentStats,
      selectedStudentId,
      setSelectedStudentId,
      examResults,
      addExamResult,
      updateExamResult,
      deleteExamResult,
      getStudentExamResults,
      getLatestExamResult,
      aiSuggestions,
      addAISuggestion,
      markSuggestionRead,
      deleteAISuggestion,
      getStudentAISuggestions,
      generateAISuggestions,
      // Kitap Okuma
      books,
      addBook,
      updateBook,
      deleteBook,
      getStudentBooks,
      readingLogs,
      addReadingLog,
      updateReadingLog,
      deleteReadingLog,
      getStudentReadingLogs,
      getReadingStats,
      getBookReadingTime,
      getReadingHeatmap,
      getCurrentStreak,
      getLongestStreak,
      getReadingComments,
      getReadingBadges,
      // Yazılı Takip
      writtenExamScores,
      addWrittenExamScore,
      updateWrittenExamScore,
      deleteWrittenExamScore,
      getStudentWrittenExamScores,
      writtenExamSubjects,
      addWrittenExamSubject,
      removeWrittenExamSubject,
      getWrittenExamSubjectsForStudent,
      addWrittenExamSubjectForStudent,
      removeWrittenExamSubjectForStudent,
      writtenExamSubjectsByStudent,
      getSubjectScores,
      calculateSemesterAverage,
      calculateYearlyAverage,
      calculateOverallAverage,
      getWrittenExamStats,
      getWrittenExamComments
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
