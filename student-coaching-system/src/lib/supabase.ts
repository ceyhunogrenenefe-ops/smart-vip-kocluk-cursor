// Türkçe: Supabase İstemci Yapılandırması
// ÖNEMLİ: Canlıda mutlaka Vercel ortam değişkeni kullanın. Sabit (hardcode) URL burada
// bırakılmaz; yanlış/eskimiş host DNS hatası (ERR_NAME_NOT_RESOLVED) üretir.
import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

const normalizeSupabaseUrl = (value: string): string => {
  if (!value) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
};

const normalizedSupabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);

const isValidHttpUrl = (value: string): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

export const isSupabaseConfigured = Boolean(normalizedSupabaseUrl && supabaseAnonKey);
export const isSupabaseUrlValid = isValidHttpUrl(normalizedSupabaseUrl);
export const isSupabaseReady = isSupabaseConfigured && isSupabaseUrlValid;
export const supabaseBaseUrl = normalizedSupabaseUrl;

if (import.meta.env.PROD && !isSupabaseConfigured) {
  console.error(
    '[Supabase] Supabase URL veya anon key tanımsız (tarayıcı paketine gömülmedi). ' +
      'Vercel → Environment Variables: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY ' +
      'veya aynı değerlerle SUPABASE_URL + SUPABASE_ANON_KEY (build sırasında otomatik eşlenir). ' +
      'Supabase Dashboard → Settings → API: Project URL + anon public key. Production için işaretleyip Redeploy.'
  );
} else if (import.meta.env.DEV && !isSupabaseConfigured) {
  console.warn(
    '[Supabase] Yerel: .env.local içinde VITE_SUPABASE_* veya SUPABASE_URL + SUPABASE_ANON_KEY ekleyin.'
  );
}

if (isSupabaseConfigured && !isSupabaseUrlValid) {
  console.error(
    '[Supabase] VITE_SUPABASE_URL geçersiz. Örnek doğru format: https://<project-ref>.supabase.co'
  );
}

// createClient boş string ile hata verebildiği için, yalnızca dev fallback (placeholder) kullanılır
const connectUrl = isSupabaseReady
  ? normalizedSupabaseUrl
  : 'https://config-missing-placeholder.supabase.co';
const connectKey = isSupabaseReady
  ? supabaseAnonKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Supabase client (env yoksa placeholder; gerçek kullanım için mutlaka VITE_* değişkenleri gerekir)
export const supabase = createClient(connectUrl, connectKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

let reachabilityChecked = false;
let reachableCache = false;

const REACHABILITY_TIMEOUT_MS = 15000;

export const verifySupabaseReachable = async (): Promise<boolean> => {
  if (!isSupabaseReady) return false;
  if (reachabilityChecked) return reachableCache;

  let timeoutId: ReturnType<typeof window.setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = window.setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
    const response = await fetch(
      `${normalizedSupabaseUrl}/rest/v1/institutions?select=id&limit=1`,
      {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      signal: controller.signal
      }
    );

    // Host erişimi + key yetkisi yoksa (401/403) Supabase kullanımı tamamen kapatılır.
    if (response.status === 401 || response.status === 403) {
      reachableCache = false;
      console.error(
        '[Supabase] API key yetkisiz (401/403). VITE_SUPABASE_ANON_KEY değerini kontrol edin.'
      );
    } else {
      reachableCache = response.status > 0;
    }
  } catch (error) {
    reachableCache = false;
    const isAbort =
      error instanceof DOMException
        ? error.name === 'AbortError'
        : error instanceof Error && error.name === 'AbortError';
    if (isAbort) {
      console.error(
        `[Supabase] İstek ${REACHABILITY_TIMEOUT_MS / 1000}s içinde tamamlanamadı (zaman aşımı). ` +
          'Supabase Dashboard’da projenin durmadığından (pause), VPN/firewall ve doğru URL/key olduğundan emin olun.'
      );
    } else {
      console.error('[Supabase] Host erişilemiyor. URL ve proje durumu kontrol edin:', error);
    }
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    reachabilityChecked = true;
  }

  return reachableCache;
};

// Database types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          phone: string | null;
          role: 'super_admin' | 'admin' | 'coach' | 'teacher' | 'student';
          password_hash: string;
          institution_id: string | null;
          created_by: string | null;
          is_active: boolean;
          package: 'trial' | 'starter' | 'professional' | 'enterprise' | null;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      students: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          class_level: string;
          school: string | null;
          parent_name: string | null;
          parent_phone: string | null;
          coach_id: string | null;
          institution_id: string | null;
          user_id?: string | null;
          platform_user_id?: string | null;
          auth_user_id?: string | null;
          program_id?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['students']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['students']['Insert']>;
      };
      coaches: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          specialties: string[];
          student_ids: string[];
          institution_id: string | null;
          managed_by_admin_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coaches']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['coaches']['Insert']>;
      };
      admin_limits: {
        Row: {
          id: string;
          admin_id: string;
          max_students: number;
          max_coaches: number;
          package_label: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['admin_limits']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['admin_limits']['Insert']>;
      };
      coach_limits: {
        Row: {
          id: string;
          coach_id: string;
          max_students: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coach_limits']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['coach_limits']['Insert']>;
      };
      weekly_entries: {
        Row: {
          id: string;
          student_id: string;
          date: string;
          subject: string;
          topic: string;
          target_questions: number;
          solved_questions: number;
          correct: number;
          wrong: number;
          blank: number;
          notes: string | null;
          reading_minutes: number | null;
          book_id: string | null;
          book_title: string | null;
          institution_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['weekly_entries']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['weekly_entries']['Insert']>;
      };
      institutions: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          address: string | null;
          website: string | null;
          logo: string | null;
          plan: 'starter' | 'professional' | 'enterprise';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['institutions']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['institutions']['Insert']>;
      };
      book_readings: {
        Row: {
          id: string;
          student_id: string;
          book_title: string;
          author: string | null;
          pages_read: number;
          start_date: string | null;
          end_date: string | null;
          notes: string | null;
          institution_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['book_readings']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['book_readings']['Insert']>;
      };
      written_exams: {
        Row: {
          id: string;
          student_id: string;
          subject: string;
          semester: number;
          exam_type: string;
          score: number;
          date: string | null;
          notes: string | null;
          institution_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['written_exams']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['written_exams']['Insert']>;
      };
      exam_results: {
        Row: {
          id: string;
          student_id: string;
          exam_name: string;
          date: string | null;
          raw_score: number | null;
          net_score: number | null;
          correct: number;
          wrong: number;
          blank: number;
          total_questions: number | null;
          institution_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['exam_results']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['exam_results']['Insert']>;
      };
      ai_exam_analysis: {
        Row: {
          id: string;
          student_id: string;
          exam_id: string | null;
          institution_id: string | null;
          exam_type: 'TYT' | 'LGS' | 'YOS';
          total_net: number;
          estimated_score: number | null;
          percentile_estimate: number | null;
          year_2025_comparison: string | null;
          year_2024_comparison: string | null;
          year_2023_comparison: string | null;
          strengths: string | null;
          weaknesses: string | null;
          recommendations: string | null;
          narrative_summary: string | null;
          computed_payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['ai_exam_analysis']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['ai_exam_analysis']['Insert']>;
      };
      topics: {
        Row: {
          id: string;
          subject: string;
          grade: string;
          subject_id?: string | null;
          program_id?: string | null;
          topic_name: string;
          description: string | null;
          institution_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['topics']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['topics']['Insert']>;
      };
      topic_progress: {
        Row: {
          id: string;
          student_id: string;
          topic_id: string;
          status: 'not_started' | 'in_progress' | 'completed';
          completion_date: string | null;
          notes: string | null;
          institution_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['topic_progress']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['topic_progress']['Insert']>;
      };
      integrations_google: {
        Row: {
          id: string;
          user_id: string;
          encrypted_access_token: string | null;
          encrypted_refresh_token: string;
          expiry_date_ms: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['integrations_google']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['integrations_google']['Insert']>;
      };
      meetings: {
        Row: {
          id: string;
          institution_id: string | null;
          coach_id: string;
          student_id: string;
          coach_user_id: string;
          start_time: string;
          end_time: string;
          meet_link: string;
          link_zoom: string | null;
          link_bbb: string | null;
          google_calendar_event_id: string | null;
          status: 'planned' | 'completed' | 'missed';
          notes: string | null;
          attended: boolean | null;
          ai_summary: string | null;
          whatsapp_created_sent: boolean;
          whatsapp_reminder_sent: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['meetings']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['meetings']['Insert']>;
      };
      meeting_notification_log: {
        Row: {
          id: string;
          meeting_id: string;
          channel: string;
          kind: string;
          recipient_e164: string;
          payload: Record<string, unknown> | null;
          status: 'pending' | 'sent' | 'failed';
          attempt_count: number;
          last_error: string | null;
          external_sid: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['meeting_notification_log']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['meeting_notification_log']['Insert']>;
      };
      programs: {
        Row: {
          id: string;
          name: 'ilkokul' | 'lgs' | 'tyt' | 'ayt' | 'yos';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['programs']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['programs']['Insert']>;
      };
      subjects: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['subjects']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['subjects']['Insert']>;
      };
      student_topic_progress: {
        Row: {
          id: string;
          student_id: string;
          topic_id: string;
          solved_questions: number;
          correct: number;
          wrong: number;
          success_rate: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['student_topic_progress']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['student_topic_progress']['Insert']>;
      };
      exams: {
        Row: {
          id: string;
          name: string;
          program_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['exams']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['exams']['Insert']>;
      };
      exam_results_v2: {
        Row: {
          id: string;
          student_id: string;
          exam_id: string;
          math_correct: number;
          geometry_correct: number;
          iq_correct: number;
          total_score: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['exam_results_v2']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['exam_results_v2']['Insert']>;
      };
      analysis_details: {
        Row: {
          student_id: string;
          dikkat_hatasi: number;
          islem_hatasi: number;
          zaman_yonetimi: number;
          gorsel_okuma_hatasi: number;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['analysis_details']['Row'], 'updated_at'> & {
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['analysis_details']['Insert']>;
      };
    };
  };
}

export default supabase;
