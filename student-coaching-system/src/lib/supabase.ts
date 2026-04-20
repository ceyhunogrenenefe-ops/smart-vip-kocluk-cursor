// Türkçe: Supabase İstemci Yapılandırması
import { createClient } from '@supabase/supabase-js';

// Environment variables - Supabase credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://urkedrzdvbhdwvrcrnjf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IlZSNwwuZtD_N1cpiddcjQ_e7EzHm_h';

// Supabase client oluştur
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

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
          role: 'super_admin' | 'admin' | 'coach' | 'student';
          password_hash: string;
          institution_id: string | null;
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
      topics: {
        Row: {
          id: string;
          subject: string;
          grade: string;
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
    };
  };
}

export default supabase;
