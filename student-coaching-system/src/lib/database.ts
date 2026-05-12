// Türkçe: Veritabanı Servis Katmanı - Supabase Entegrasyonu
import { supabase, Database } from './supabase';
import { apiFetch } from './session';
import type { StudentTeacherLessonQuota } from '../types';

// Tip tanımları
type UserRow = Database['public']['Tables']['users']['Row'];
type StudentRow = Database['public']['Tables']['students']['Row'];
type CoachRow = Database['public']['Tables']['coaches']['Row'];
type InstitutionRow = Database['public']['Tables']['institutions']['Row'];
type WeeklyEntryRow = Database['public']['Tables']['weekly_entries']['Row'];
type BookReadingRow = Database['public']['Tables']['book_readings']['Row'];
type WrittenExamRow = Database['public']['Tables']['written_exams']['Row'];
type ExamResultRow = Database['public']['Tables']['exam_results']['Row'];

/** GET /api/quota yanıt gövdesi (data sarmalayıcısı apiJson tarafından çözülür) */
export interface QuotaSnapshot {
  institution_id: string | null;
  admin_user_id: string | null;
  admin_limits: {
    max_students: number;
    max_coaches: number;
    package_label: string | null;
  } | null;
  counts: { students: number; coaches: number };
  usage_pct: { students: number | null; coaches: number | null };
  coach?: {
    coach_id: string;
    max_students: number | null;
    assigned_students: number;
    usage_pct: number | null;
  } | null;
}
type TopicRow = Database['public']['Tables']['topics']['Row'];
type TopicProgressRow = Database['public']['Tables']['topic_progress']['Row'];

const LOOKS_LIKE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Postgres `institutions.id` ve canlı ders şemasındaki `institution_id` (uuid) ile uyumlu */
function newInstitutionUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Veritabanı Servisi
class DatabaseService {
  /** Sunucu { data } veya doğrudan dizi/obje döndürebilir; hatalı yanlış rewrite (SPA 405/200) güvenliği */
  private unwrapData<T>(payload: unknown): T | undefined {
    if (payload == null || typeof payload !== 'object') return undefined;
    if ('data' in payload && payload.data !== undefined) return payload.data as T;
    return payload as T;
  }

  private async apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await apiFetch(path, options);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || `API error (${res.status})`);
    }
    return this.unwrapData<T>(payload) as T;
  }

  /** Listeler için: yanlış cevaplarda bile .filter güvenli kalsın */
  private unwrapArray<T>(payload: unknown, label: string): T[] {
    const raw = this.unwrapData<any>(payload);
    if (!Array.isArray(raw)) {
      console.warn(`[database] Beklenen dizi (${label}) yerine başka yapı döndü, [] kullanılıyor`);
      return [];
    }
    return raw as T[];
  }

  private async apiListJson<T>(path: string, label: string): Promise<T[]> {
    const res = await apiFetch(path);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((payload as { error?: string })?.error || `API error (${res.status})`);
    return this.unwrapArray<T>(payload, label);
  }

  // ========== KULLANICILAR ==========

  private async fetchUsersPayload(options: RequestInit = {}): Promise<UserRow[]> {
    const res = await apiFetch('/api/users', options);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || `API error (${res.status})`);
    return this.unwrapArray<UserRow>(payload, '/api/users');
  }

  // Tüm kullanıcıları getir
  async getUsers(): Promise<UserRow[]> {
    return this.fetchUsersPayload();
  }

  // E-posta ile kullanıcı getir
  async getUserByEmail(email: string): Promise<UserRow | null> {
    const res = await apiFetch(`/api/users?email=${encodeURIComponent(email.toLowerCase())}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || `API error (${res.status})`);
    const rows = this.unwrapArray<UserRow>(payload, '/api/users?email');
    return rows[0] || null;
  }

  // ID ile kullanıcı getir
  async getUserById(id: string): Promise<UserRow | null> {
    const rows = await this.getUsers();
    return rows.find((u) => u.id === id) || null;
  }

  // Kullanıcı oluştur (super_admin→admin bootstrap alanları opsiyonel)
  async createUser(
    user: Omit<UserRow, 'id' | 'created_at' | 'updated_at'>,
    options?: {
      preferredId?: string;
      bootstrap?: {
        bootstrap_max_students?: number;
        bootstrap_max_coaches?: number;
        bootstrap_package_label?: string;
      };
    }
  ): Promise<UserRow> {
    const id =
      (options?.preferredId && String(options.preferredId).trim()) ||
      `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return this.apiJson<UserRow>('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        ...user,
        ...options?.bootstrap,
        id,
        created_at: now,
        updated_at: now
      })
    });
  }

  // Kullanıcı güncelle
  async updateUser(id: string, updates: Partial<UserRow>): Promise<UserRow> {
    return this.apiJson<UserRow>(`/api/users?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });
  }

  // Kullanıcı sil
  async deleteUser(id: string): Promise<void> {
    await this.apiJson<{ ok: boolean }>(`/api/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async getQuotaSnapshot(institutionId?: string | null): Promise<QuotaSnapshot> {
    const q =
      institutionId && String(institutionId).trim()
        ? `?institution_id=${encodeURIComponent(String(institutionId).trim())}`
        : '';
    return this.apiJson<QuotaSnapshot>(`/api/quota${q}`);
  }

  /** Süper admin: belirli yöneticinin kota satırını okur */
  async getAdminQuotaByAdmin(adminId: string): Promise<{
    admin_user_id: string;
    institution_id: string | null;
    admin_limits: {
      max_students: number;
      max_coaches: number;
      package_label: string | null;
    } | null;
  }> {
    return this.apiJson(
      `/api/quota?admin_limits_for=${encodeURIComponent(String(adminId).trim())}`
    );
  }

  async patchAdminQuota(
    adminUserId: string,
    opts: { max_students?: number; max_coaches?: number; package_label?: string }
  ): Promise<{ ok: boolean }> {
    return this.apiJson('/api/quota', {
      method: 'PATCH',
      body: JSON.stringify({
        scope: 'admin',
        admin_user_id: adminUserId,
        max_students: opts.max_students,
        max_coaches: opts.max_coaches,
        package_label: opts.package_label
      })
    });
  }

  async patchCoachStudentQuota(coachId: string, maxStudents: number): Promise<{ ok: boolean }> {
    return this.apiJson('/api/quota', {
      method: 'PATCH',
      body: JSON.stringify({
        scope: 'coach',
        coach_id: coachId,
        max_students: maxStudents
      })
    });
  }

  /** Öğrencinin öğretmen bazlı canlı ders kotası (scheduled+completed sayılır) */
  async getStudentTeacherLessonQuotas(studentId: string): Promise<StudentTeacherLessonQuota[]> {
    return this.apiListJson<StudentTeacherLessonQuota>(
      `/api/student-teacher-lesson-quota?student_id=${encodeURIComponent(studentId)}`,
      '/api/student-teacher-lesson-quota'
    );
  }

  async upsertStudentTeacherLessonQuota(payload: {
    student_id: string;
    teacher_id: string;
    credits_total: number | null;
  }): Promise<StudentTeacherLessonQuota> {
    return this.apiJson<StudentTeacherLessonQuota>('/api/student-teacher-lesson-quota', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async deleteStudentTeacherLessonQuota(studentId: string, teacherId: string): Promise<void> {
    await this.apiJson<{ ok: boolean }>(
      `/api/student-teacher-lesson-quota?student_id=${encodeURIComponent(studentId)}&teacher_id=${encodeURIComponent(teacherId)}`,
      { method: 'DELETE' }
    );
  }

  /** Yönetici / süper admin: tek koçun öğrenci kotası */
  async getCoachQuota(coachId: string): Promise<{
    coach_id: string;
    max_students: number | null;
    assigned_students: number;
  }> {
    return this.apiJson(
      `/api/quota?coach_limit_for=${encodeURIComponent(String(coachId).trim())}`
    );
  }

  // ========== ÖĞRENCİLER ==========

  // Tüm öğrencileri getir
  async getStudents(institutionId?: string): Promise<StudentRow[]> {
    const rows = await this.apiListJson<StudentRow>('/api/students', '/api/students');
    if (!institutionId) return rows;
    return rows.filter((s) => s.institution_id === institutionId);
  }

  // Öğrenci oluştur (preferredId: kullanıcı yönetimi / yerel kimlik ile eşleşme için)
  async createStudent(
    student: Omit<StudentRow, 'id' | 'created_at' | 'updated_at'>,
    preferredId?: string,
    provision?: { sync_supabase_auth?: boolean; auth_password?: string }
  ): Promise<StudentRow> {
    const id =
      (preferredId && String(preferredId).trim()) ||
      `student-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return this.apiJson<StudentRow>('/api/students', {
      method: 'POST',
      body: JSON.stringify({
        ...student,
        id,
        created_at: now,
        updated_at: now,
        sync_supabase_auth: provision?.sync_supabase_auth === true,
        auth_password: provision?.auth_password
      })
    });
  }

  /** Oturum açmış öğrencinin tek canonical kartı (GET /api/my-student) */
  async getMyStudent(): Promise<StudentRow | null> {
    const res = await apiFetch('/api/my-student');
    const payload = await res.json().catch(() => ({}));
    if (res.status === 404) return null;
    if (!res.ok) {
      const p = payload as { message?: string; error?: string };
      throw new Error(p.message || p.error || `API error (${res.status})`);
    }
    // Sunucu { data: row }; unwrapData içeriği tek seferde döner
    const data = this.unwrapData<StudentRow>(payload);
    return data ?? null;
  }

  // Öğrenci güncelle
  async updateStudent(id: string, updates: Partial<StudentRow>): Promise<StudentRow> {
    return this.apiJson<StudentRow>(`/api/students?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });
  }

  // Öğrenci sil
  async deleteStudent(id: string): Promise<void> {
    await this.apiJson<{ ok: boolean }>(`/api/students?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ========== KOÇLAR ==========

  // Tüm koçları getir
  async getCoaches(institutionId?: string): Promise<CoachRow[]> {
    const rows = await this.apiListJson<CoachRow>('/api/coaches', '/api/coaches');
    if (!institutionId) return rows;
    return rows.filter((c) => c.institution_id === institutionId);
  }

  // Koç oluştur
  async createCoach(
    coach: Omit<CoachRow, 'id' | 'created_at' | 'updated_at'>,
    preferredId?: string
  ): Promise<CoachRow> {
    const id =
      (preferredId && String(preferredId).trim()) ||
      `coach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return this.apiJson<CoachRow>('/api/coaches', {
      method: 'POST',
      body: JSON.stringify({ ...coach, id, created_at: now, updated_at: now })
    });
  }

  // Koç güncelle
  async updateCoach(id: string, updates: Partial<CoachRow>): Promise<CoachRow> {
    return this.apiJson<CoachRow>(`/api/coaches?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });
  }

  // Koç sil
  async deleteCoach(id: string): Promise<void> {
    await this.apiJson<{ ok: boolean }>(`/api/coaches?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ========== KURUMLAR ==========

  // Tüm kurumları getir
  async getInstitutions(): Promise<InstitutionRow[]> {
    const { data, error } = await supabase
      .from('institutions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Kurumları getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Kurum oluştur
  async createInstitution(institution: Omit<InstitutionRow, 'id' | 'created_at' | 'updated_at'>): Promise<InstitutionRow> {
    const id = newInstitutionUuid();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('institutions')
      .insert({
        ...institution,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Kurum oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // Kurum güncelle
  async updateInstitution(id: string, updates: Partial<InstitutionRow>): Promise<InstitutionRow> {
    const { data, error } = await supabase
      .from('institutions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Kurum güncelleme hatası:', error);
      throw error;
    }
    return data;
  }

  // ========== HAFTALIK KAYITLAR ==========

  // Haftalık kayıtları getir
  async getWeeklyEntries(studentId?: string, institutionId?: string): Promise<WeeklyEntryRow[]> {
    const rows = await this.apiListJson<WeeklyEntryRow>('/api/weekly-entries', '/api/weekly-entries');
    return rows.filter((r) => (!studentId || r.student_id === studentId) && (!institutionId || r.institution_id === institutionId));
  }

  // Haftalık kayıt oluştur
  async createWeeklyEntry(entry: Omit<WeeklyEntryRow, 'id' | 'created_at' | 'updated_at'>): Promise<WeeklyEntryRow> {
    const id = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return this.apiJson<WeeklyEntryRow>('/api/weekly-entries', {
      method: 'POST',
      body: JSON.stringify({ ...entry, id, created_at: now, updated_at: now })
    });
  }

  // Haftalık kayıt güncelle
  async updateWeeklyEntry(id: string, updates: Partial<WeeklyEntryRow>): Promise<WeeklyEntryRow> {
    return this.apiJson<WeeklyEntryRow>(`/api/weekly-entries?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });
  }

  // Haftalık kayıt sil
  async deleteWeeklyEntry(id: string): Promise<void> {
    await this.apiJson<{ ok: boolean }>(`/api/weekly-entries?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ========== KİTAP OKUMA ==========

  // Kitap okuma kayıtlarını getir
  async getBookReadings(studentId?: string): Promise<BookReadingRow[]> {
    const rows = await this.apiJson<BookReadingRow[]>('/api/book-readings');
    return studentId ? rows.filter((r) => r.student_id === studentId) : rows;
  }

  // Kitap okuma oluştur
  async createBookReading(book: Omit<BookReadingRow, 'id' | 'created_at' | 'updated_at'>): Promise<BookReadingRow> {
    const id = `book-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return this.apiJson<BookReadingRow>('/api/book-readings', {
      method: 'POST',
      body: JSON.stringify({ ...book, id, created_at: now, updated_at: now })
    });
  }

  async updateBookReading(id: string, updates: Partial<BookReadingRow>): Promise<BookReadingRow> {
    return this.apiJson<BookReadingRow>(`/api/book-readings?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });
  }

  async deleteBookReading(id: string): Promise<void> {
    await this.apiJson<{ ok: boolean }>(`/api/book-readings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ========== YAZILI SINAVLAR ==========

  // Yazılı sınav kayıtlarını getir
  async getWrittenExams(studentId?: string): Promise<WrittenExamRow[]> {
    const rows = await this.apiListJson<WrittenExamRow>('/api/written-exams', '/api/written-exams');
    return studentId ? rows.filter((r) => r.student_id === studentId) : rows;
  }

  // Yazılı sınav oluştur
  async createWrittenExam(exam: Omit<WrittenExamRow, 'id' | 'created_at' | 'updated_at'>): Promise<WrittenExamRow> {
    const id = `exam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return this.apiJson<WrittenExamRow>('/api/written-exams', {
      method: 'POST',
      body: JSON.stringify({ ...exam, id, created_at: now, updated_at: now })
    });
  }

  async updateWrittenExam(id: string, updates: Partial<WrittenExamRow>): Promise<WrittenExamRow> {
    return this.apiJson<WrittenExamRow>(`/api/written-exams?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });
  }

  async deleteWrittenExam(id: string): Promise<void> {
    await this.apiJson<{ ok: boolean }>(`/api/written-exams?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ========== DENEME SINAVLARI ==========

  // Deneme sınav kayıtlarını getir
  async getExamResults(studentId?: string): Promise<ExamResultRow[]> {
    let query = supabase.from('exam_results').select('*').order('created_at', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Deneme sınav kayıtlarını getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Deneme sınav oluştur
  async createExamResult(exam: Omit<ExamResultRow, 'id' | 'created_at' | 'updated_at'>): Promise<ExamResultRow> {
    const id = `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('exam_results')
      .insert({
        ...exam,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Deneme sınav oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // ========== KONULAR ==========

  // Konuları getir
  async getTopics(subject?: string, grade?: string): Promise<TopicRow[]> {
    let query = supabase.from('topics').select('*').order('topic_name');

    if (subject) {
      query = query.eq('subject', subject);
    }
    if (grade) {
      query = query.eq('grade', grade);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Konuları getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Konu oluştur
  async createTopic(topic: Omit<TopicRow, 'id' | 'created_at'>): Promise<TopicRow> {
    const id = `topic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase
      .from('topics')
      .insert({
        ...topic,
        id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Konu oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // ========== KONU İLERLEME ==========

  // Konu ilerlemelerini getir
  async getTopicProgress(studentId?: string): Promise<TopicProgressRow[]> {
    let query = supabase.from('topic_progress').select('*');

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Konu ilerlemelerini getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Konu ilerleme güncelle/oluştur
  async upsertTopicProgress(progress: Omit<TopicProgressRow, 'id' | 'created_at' | 'updated_at'>): Promise<TopicProgressRow> {
    const { data: existing } = await supabase
      .from('topic_progress')
      .select('*')
      .eq('student_id', progress.student_id)
      .eq('topic_id', progress.topic_id)
      .maybeSingle();

    if (existing) {
      // Güncelle
      const { data, error } = await supabase
        .from('topic_progress')
        .update({ ...progress, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Konu ilerleme güncelleme hatası:', error);
        throw error;
      }
      return data;
    } else {
      // Oluştur
      const id = `progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('topic_progress')
        .insert({
          ...progress,
          id,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (error) {
        console.error('Konu ilerleme oluşturma hatası:', error);
        throw error;
      }
      return data;
    }
  }

  // ========== BAŞLANGIÇ VERİLERİ ==========

  // Veritabanı başlat (tabloları oluştur)
  async initializeDatabase(): Promise<void> {
    try {
      // Önce default kurum kontrol et
      const { data: existingInst } = await supabase
        .from('institutions')
        .select('id')
        .eq('name', 'Smart Koçluk Sistemi')
        .maybeSingle();

      if (!existingInst) {
        // Default kurum oluştur
        await this.createInstitution({
          name: 'Smart Koçluk Sistemi',
          email: 'info@smartkocluk.com',
          phone: '0500 000 00 00',
          address: 'Türkiye',
          website: 'https://smartkocluk.com',
          logo: null,
          plan: 'enterprise',
          is_active: true
        });
      }

      // Super Admin kontrol et
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', 'admin@smartkocluk.com')
        .maybeSingle();

      if (!existingUser) {
        // Default super admin oluştur
        await this.createUser({
          email: 'admin@smartkocluk.com',
          name: 'Süper Admin',
          phone: '0500 000 00 00',
          role: 'super_admin',
          password_hash: 'Admin123!', // Şifre plain text olarak saklanıyor (gerçek projede hash lenmeli)
          institution_id: null,
          is_active: true,
          package: 'enterprise',
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        });
      }

      console.log('Veritabanı başarıyla başlatıldı');
    } catch (error) {
      console.error('Veritabanı başlatma hatası:', error);
    }
  }
}

// Servis örneği oluştur
export const db = new DatabaseService();
export default db;
