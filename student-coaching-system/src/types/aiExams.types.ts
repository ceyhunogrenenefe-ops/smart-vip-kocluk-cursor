export type ExamQuestionStatus = 'draft' | 'approved' | 'rejected';
export type ExamPaperStatus = 'draft' | 'published' | 'archived';
export type ExamDifficulty = 'kolay' | 'orta' | 'zor';
export type ExamAssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'expired';
export type ExamAttemptStatus = 'in_progress' | 'submitted' | 'graded';

export interface ExamQuestion {
  id: string;
  agent_id: string;
  document_id?: string | null;
  page_no?: number | null;
  question_text: string;
  options: string[];
  answer_key?: string | null;
  solution?: string | null;
  topic?: string | null;
  subtopic?: string | null;
  difficulty?: ExamDifficulty | null;
  question_type: string;
  status: ExamQuestionStatus;
  ai_confidence?: number | null;
  ai_model?: string | null;
  created_at: string;
}

export interface ExamPaper {
  id: string;
  agent_id: string;
  title: string;
  description?: string | null;
  duration_minutes: number;
  question_count: number;
  total_score: number;
  question_ids: string[];
  status: ExamPaperStatus;
  created_at: string;
}

export interface ExamPaperDetail extends ExamPaper {
  questions: ExamQuestion[];
}

export interface ExamAssignmentMine {
  id: string;
  paper_id: string;
  agent_id: string;
  status: ExamAssignmentStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  paper?: {
    id: string;
    title: string;
    description?: string | null;
    duration_minutes: number;
    question_count: number;
    total_score: number;
  };
  agent?: { id: string; name: string; subject: string };
  attempt?: {
    assignment_id: string;
    status: ExamAttemptStatus;
    score?: number;
    submitted_at?: string;
  } | null;
}

export interface ExamAssignmentForPaper {
  id: string;
  student_user_id: string;
  status: ExamAssignmentStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  student?: { id: string; name: string; email?: string };
  attempt?: {
    status: ExamAttemptStatus;
    score?: number;
    correct_count?: number;
    wrong_count?: number;
    empty_count?: number;
    duration_seconds?: number;
    submitted_at?: string;
  } | null;
}

export interface ExamAttempt {
  id: string;
  assignment_id: string;
  paper_id: string;
  agent_id: string;
  started_at: string;
  submitted_at?: string | null;
  answers: Record<string, string>;
  score?: number | null;
  correct_count?: number;
  wrong_count?: number;
  empty_count?: number;
  duration_seconds?: number;
  topic_breakdown?: Record<string, { correct: number; wrong: number; empty: number; total: number }> | null;
  status: ExamAttemptStatus;
}

export interface AttemptStartResponse {
  attempt: ExamAttempt;
  paper: {
    id: string;
    title: string;
    description?: string | null;
    duration_minutes: number;
    total_score: number;
    question_count: number;
  };
  questions: Array<{
    id: string;
    question_text: string;
    options: string[];
    topic?: string | null;
    difficulty?: ExamDifficulty | null;
  }>;
}

export interface AttemptSubmitResponse {
  ok: boolean;
  score: number;
  correct: number;
  wrong: number;
  empty: number;
  total: number;
  topic_breakdown: Record<string, { correct: number; wrong: number; empty: number; total: number }>;
  duration_seconds: number;
}

export interface AttemptResultResponse {
  attempt: ExamAttempt;
  paper: ExamPaper;
  questions: ExamQuestion[];
}
