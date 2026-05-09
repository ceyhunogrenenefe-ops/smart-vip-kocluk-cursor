create extension if not exists pgcrypto;

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid null,
  name text not null,
  class_level text null,
  description text null,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_classes_institution_id on classes (institution_id);
create unique index if not exists uq_classes_institution_name on classes (institution_id, lower(name));

create table if not exists class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, teacher_id)
);

create index if not exists idx_class_teachers_teacher_id on class_teachers (teacher_id);

create table if not exists class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create index if not exists idx_class_students_student_id on class_students (student_id);

create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  institution_id uuid null,
  lesson_date date not null,
  start_time time not null,
  end_time time not null,
  subject text not null,
  teacher_id text not null references users(id) on delete cascade,
  meeting_link text not null,
  homework text null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  reminder_sent boolean not null default false,
  homework_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_class_sessions_class_id_date on class_sessions (class_id, lesson_date);
create index if not exists idx_class_sessions_teacher_id_date on class_sessions (teacher_id, lesson_date);
create index if not exists idx_class_sessions_status on class_sessions (status);

create table if not exists class_weekly_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  institution_id uuid null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  subject text not null,
  teacher_id text not null references users(id) on delete cascade,
  meeting_link text not null,
  homework text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_class_weekly_slots_class_day on class_weekly_slots (class_id, day_of_week, start_time);
create index if not exists idx_class_weekly_slots_teacher_day on class_weekly_slots (teacher_id, day_of_week, start_time);

create table if not exists class_session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  status text not null check (status in ('present', 'absent')),
  marked_by text null,
  marked_at timestamptz not null default now(),
  unique (session_id, student_id)
);

alter table if exists classes alter column created_by type text using created_by::text;
alter table if exists class_teachers alter column teacher_id type text using teacher_id::text;
alter table if exists class_students alter column student_id type text using student_id::text;
alter table if exists class_sessions alter column teacher_id type text using teacher_id::text;
alter table if exists class_session_attendance alter column student_id type text using student_id::text;
alter table if exists class_session_attendance alter column marked_by type text using marked_by::text;

create index if not exists idx_class_session_attendance_session_id on class_session_attendance (session_id);

insert into message_templates (type, name, content, variables)
values
  (
    'class_lesson_reminder',
    'Sınıf dersi hatırlatma',
    'Merhaba {{student_name}}, {{class_name}} sınıfı {{subject}} dersi saat {{lesson_time}}''de başlayacak. Katılım linki: {{meeting_link}}',
    '["student_name","class_name","subject","lesson_time","meeting_link"]'::jsonb
  ),
  (
    'class_homework_notice',
    'Sınıf ödev bildirimi',
    'Merhaba {{student_name}}, {{class_name}} - {{subject}} dersi sonrası ödev: {{homework}}',
    '["student_name","class_name","subject","homework"]'::jsonb
  ),
  (
    'class_absent_notice',
    'Devamsızlık bildirimi (veli)',
    'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).',
    '["student_name","class_name","subject","lesson_date","lesson_time"]'::jsonb
  )
on conflict (type) do nothing;

notify pgrst, 'reload schema';
