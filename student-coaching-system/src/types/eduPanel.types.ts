export type LessonStatus = 'draft' | 'active' | 'archived';
export type HomeworkStatus = 'draft' | 'published';
export type SubmissionStatus = 'submitted' | 'reviewed' | 'returned';
export type SubjectColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'pink' | 'gray';

export type EduClass = {
  id: string;
  name: string;
  class_level?: string | null;
  institution_id?: string | null;
};

export type EduAnimation = {
  id: string;
  lesson_row_id: string;
  original_name: string;
  storage_path: string;
  file_size: number;
  display_order: number;
  pool_id?: string | null;
};

export type EduAnimationPoolTarget = {
  program: 'lgs' | 'tyt' | 'ayt';
  class_level: string;
};

export type EduAnimationPoolItem = {
  id: string;
  institution_id?: string | null;
  teacher_user_id: string;
  teacher_name?: string;
  title: string;
  program: 'lgs' | 'tyt' | 'ayt';
  class_level: string;
  targets?: EduAnimationPoolTarget[];
  subject_name: string;
  topic_name: string;
  original_name: string;
  storage_path: string;
  file_size: number;
  created_at?: string;
  updated_at?: string;
};

export type EduHomeworkSubmission = {
  id: string;
  homework_id: string;
  student_user_id: string;
  storage_path: string;
  submitted_at: string;
  teacher_note?: string | null;
  grade?: string | null;
  status: SubmissionStatus;
};

export type EduHomework = {
  id: string;
  lesson_row_id: string;
  title: string;
  book_name?: string | null;
  question_range?: string | null;
  description?: string | null;
  due_date?: string | null;
  status: HomeworkStatus;
  pool_animation_id?: string | null;
  submissions?: EduHomeworkSubmission[];
};

export type EduLessonRow = {
  id: string;
  teacher_user_id: string;
  institution_id?: string | null;
  class_id: string;
  /** Junction tablosundan — birincil class_id dahil tüm sınıflar */
  class_ids?: string[];
  title: string;
  subject_name: string;
  subject_color: SubjectColor;
  lesson_date: string;
  available_from?: string | null;
  available_until?: string | null;
  status: LessonStatus;
  notes?: string | null;
  animations?: EduAnimation[];
  homework?: EduHomework[];
};

export type EduLessonRowProgress = {
  id: string;
  lesson_row_id: string;
  student_user_id: string;
  student_id?: string | null;
  animation_completed: boolean;
  animation_completed_at?: string | null;
  homework_percent: number;
  topic_completed: boolean;
  topic_completed_at?: string | null;
  points: number;
  updated_at?: string;
};

export type EduRowStudentProgress = {
  student_id: string;
  student_user_id: string;
  student_name: string;
  class_id?: string | null;
  animation_completed: boolean;
  homework_percent: number;
  topic_completed: boolean;
  points: number;
  topic_completed_at?: string | null;
};

export type LessonRowFormValues = {
  class_id: string;
  /** Birden fazla sınıf — API birincil olarak class_id kullanır */
  class_ids?: string[];
  title: string;
  subject_name: string;
  subject_color: SubjectColor;
  lesson_date: string;
  available_from?: string;
  available_until?: string;
  status: LessonStatus;
  notes?: string;
};
