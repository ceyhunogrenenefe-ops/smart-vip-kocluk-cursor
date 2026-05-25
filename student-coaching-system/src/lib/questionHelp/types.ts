export type QuestionStatus = 'waiting' | 'claimed' | 'solving' | 'solved' | 'cancelled';

export interface QuestionRow {
  id: string;
  institution_id: string | null;
  student_id: string;
  subject: string;
  grade: string;
  topic: string | null;
  description: string | null;
  image_url: string | null;
  status: QuestionStatus;
  claimed_by: string | null;
  solved_by: string | null;
  solved_text: string | null;
  solved_image_url: string | null;
  solved_video_url: string | null;
  solved_audio_url: string | null;
  solved_pdf_url: string | null;
  priority: number;
  satisfaction_rating: number | null;
  source: string;
  ai_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  solved_at: string | null;
  claimed_at: string | null;
}

export interface QuestionNotificationRow {
  id: string;
  user_id: string;
  question_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}
