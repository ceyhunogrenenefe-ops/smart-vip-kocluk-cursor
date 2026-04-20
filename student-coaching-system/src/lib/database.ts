// Türkçe: Veritabanı Servis Katmanı - Supabase Entegrasyonu
import { supabase, Database } from './supabase';

// Tip tanımları
type UserRow = Database['public']['Tables']['users']['Row'];
type StudentRow = Database['public']['Tables']['students']['Row'];
type CoachRow = Database['public']['Tables']['coaches']['Row'];
type InstitutionRow = Database['public']['Tables']['institutions']['Row'];
type WeeklyEntryRow = Database['public']['Tables']['weekly_entries']['Row'];
type BookReadingRow = Database['public']['Tables']['book_readings']['Row'];
type WrittenExamRow = Database['public']['Tables']['written_exams']['Row'];
type ExamResultRow = Database['public']['Tables']['exam_results']['Row'];
type TopicRow = Database['public']['Tables']['topics']['Row'];
type TopicProgressRow = Database['public']['Tables']['topic_progress']['Row'];

// Veritabanı Servisi
class DatabaseService {
  // ========== KULLANICILAR ==========

  // Tüm kullanıcıları getir
  async getUsers(): Promise<UserRow[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Kullanıcıları getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // E-posta ile kullanıcı getir
  async getUserByEmail(email: string): Promise<UserRow | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Kullanıcı getirme hatası:', error);
      throw error;
    }
    return data;
  }

  // ID ile kullanıcı getir
  async getUserById(id: string): Promise<UserRow | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Kullanıcı getirme hatası:', error);
      throw error;
    }
    return data;
  }

  // Kullanıcı oluştur
  async createUser(user: Omit<UserRow, 'id' | 'created_at' | 'updated_at'>): Promise<UserRow> {
    const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .insert({
        ...user,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Kullanıcı oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // Kullanıcı güncelle
  async updateUser(id: string, updates: Partial<UserRow>): Promise<UserRow> {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Kullanıcı güncelleme hatası:', error);
      throw error;
    }
    return data;
  }

  // Kullanıcı sil
  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Kullanıcı silme hatası:', error);
      throw error;
    }
  }

  // ========== ÖĞRENCİLER ==========

  // Tüm öğrencileri getir
  async getStudents(institutionId?: string): Promise<StudentRow[]> {
    let query = supabase.from('students').select('*').order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Öğrencileri getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Öğrenci oluştur
  async createStudent(student: Omit<StudentRow, 'id' | 'created_at' | 'updated_at'>): Promise<StudentRow> {
    const id = `student-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('students')
      .insert({
        ...student,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Öğrenci oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // Öğrenci güncelle
  async updateStudent(id: string, updates: Partial<StudentRow>): Promise<StudentRow> {
    const { data, error } = await supabase
      .from('students')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Öğrenci güncelleme hatası:', error);
      throw error;
    }
    return data;
  }

  // Öğrenci sil
  async deleteStudent(id: string): Promise<void> {
    const { error } = await supabase.from('students').delete().eq('id', id);

    if (error) {
      console.error('Öğrenci silme hatası:', error);
      throw error;
    }
  }

  // ========== KOÇLAR ==========

  // Tüm koçları getir
  async getCoaches(institutionId?: string): Promise<CoachRow[]> {
    let query = supabase.from('coaches').select('*').order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Koçları getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Koç oluştur
  async createCoach(coach: Omit<CoachRow, 'id' | 'created_at' | 'updated_at'>): Promise<CoachRow> {
    const id = `coach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('coaches')
      .insert({
        ...coach,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Koç oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // Koç güncelle
  async updateCoach(id: string, updates: Partial<CoachRow>): Promise<CoachRow> {
    const { data, error } = await supabase
      .from('coaches')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Koç güncelleme hatası:', error);
      throw error;
    }
    return data;
  }

  // Koç sil
  async deleteCoach(id: string): Promise<void> {
    const { error } = await supabase.from('coaches').delete().eq('id', id);

    if (error) {
      console.error('Koç silme hatası:', error);
      throw error;
    }
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
    const id = `inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    let query = supabase.from('weekly_entries').select('*').order('date', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    }
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Haftalık kayıtları getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Haftalık kayıt oluştur
  async createWeeklyEntry(entry: Omit<WeeklyEntryRow, 'id' | 'created_at' | 'updated_at'>): Promise<WeeklyEntryRow> {
    const id = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('weekly_entries')
      .insert({
        ...entry,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Haftalık kayıt oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // Haftalık kayıt güncelle
  async updateWeeklyEntry(id: string, updates: Partial<WeeklyEntryRow>): Promise<WeeklyEntryRow> {
    const { data, error } = await supabase
      .from('weekly_entries')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Haftalık kayıt güncelleme hatası:', error);
      throw error;
    }
    return data;
  }

  // Haftalık kayıt sil
  async deleteWeeklyEntry(id: string): Promise<void> {
    const { error } = await supabase.from('weekly_entries').delete().eq('id', id);

    if (error) {
      console.error('Haftalık kayıt silme hatası:', error);
      throw error;
    }
  }

  // ========== KİTAP OKUMA ==========

  // Kitap okuma kayıtlarını getir
  async getBookReadings(studentId?: string): Promise<BookReadingRow[]> {
    let query = supabase.from('book_readings').select('*').order('created_at', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Kitap okuma kayıtlarını getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Kitap okuma oluştur
  async createBookReading(book: Omit<BookReadingRow, 'id' | 'created_at' | 'updated_at'>): Promise<BookReadingRow> {
    const id = `book-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('book_readings')
      .insert({
        ...book,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Kitap okuma oluşturma hatası:', error);
      throw error;
    }
    return data;
  }

  // ========== YAZILI SINAVLAR ==========

  // Yazılı sınav kayıtlarını getir
  async getWrittenExams(studentId?: string): Promise<WrittenExamRow[]> {
    let query = supabase.from('written_exams').select('*').order('date', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Yazılı sınav kayıtlarını getirme hatası:', error);
      throw error;
    }
    return data || [];
  }

  // Yazılı sınav oluştur
  async createWrittenExam(exam: Omit<WrittenExamRow, 'id' | 'created_at' | 'updated_at'>): Promise<WrittenExamRow> {
    const id = `exam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('written_exams')
      .insert({
        ...exam,
        id,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Yazılı sınav oluşturma hatası:', error);
      throw error;
    }
    return data;
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
      .single();

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
        .single();

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
        .single();

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
