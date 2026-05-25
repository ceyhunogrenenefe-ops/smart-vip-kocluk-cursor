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
  submissions?: EduHomeworkSubmission[];
};

export type EduLessonRow = {
  id: string;
  teacher_user_id: string;
  institution_id?: string | null;
  class_id: string;
  title: string;
  subject_name: string;
  subject_color: SubjectColor;
  lesson_date: string;
  status: LessonStatus;
  notes?: string | null;
  animations?: EduAnimation[];
  homework?: EduHomework[];
};

export type LessonRowFormValues = {
  class_id: string;
  title: string;
  subject_name: string;
  subject_color: SubjectColor;
  lesson_date: string;
  status: LessonStatus;
  notes?: string;
};
