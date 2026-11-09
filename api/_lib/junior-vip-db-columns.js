/**
 * Junior VIP'in okuduğu tabloların CANLI şema kolonları (Supabase information_schema, 2026-11-09).
 * Testlerdeki sahte veritabanı bu listeyle select() kolonlarını doğrular; böylece canlıda
 * olmayan bir kolon (ör. students.group_name, meetings.title) seçilirse test kırılır.
 * Şemaya kolon eklenince buraya da eklenmeli.
 */
export const JUNIOR_VIP_DB_COLUMNS = {
  students:
    'id,name,email,phone,class_level,school,parent_name,parent_phone,coach_id,institution_id,created_at,updated_at,program_id,platform_user_id,auth_user_id,user_id,birth_date,program_package_id,edesis_ogrenci_id,whatsapp_automation_enabled,tc_identity_no,branch,enrollment_status,deleted_at,extra_topic_levels',
  coaches:
    'id,name,email,phone,specialties,student_ids,institution_id,created_at,updated_at,managed_by_admin_id,lessons_meetings_locked',
  meetings:
    'id,institution_id,coach_id,student_id,coach_user_id,start_time,end_time,meet_link,google_calendar_event_id,status,notes,attended,ai_summary,whatsapp_created_sent,whatsapp_reminder_sent,created_at,updated_at,link_zoom,link_bbb,series_id',
  classes: 'id,institution_id,name,description,created_by,created_at,class_level,branch',
  class_students: 'id,class_id,student_id,created_at,subjects',
  class_sessions:
    'id,class_id,institution_id,lesson_date,start_time,end_time,subject,teacher_id,meeting_link,homework,status,reminder_sent,homework_sent,created_at,updated_at,meeting_link_moderator,bbb_meeting_id,bbb_attendee_pw,bbb_seen_names,attendance_auto_at,recording_link,schedule_batch_id,origin_slot_id',
  teacher_lessons:
    'id,institution_id,teacher_id,student_id,title,lesson_date,start_time,end_time,meeting_link,platform,status,created_at,duration_minutes,series_id,meeting_link_moderator,recording_link,updated_at,bbb_meeting_id,bbb_attendee_pw',
  weekly_entries:
    'id,student_id,date,subject,topic,target_questions,solved_questions,correct,wrong,blank,notes,institution_id,created_at,updated_at,reading_minutes,book_id,book_title,pages_read,screen_time_minutes,study_minutes',
  weekly_planner_entries:
    'id,student_id,institution_id,coach_goal_id,subject,title,planned_quantity,completed_quantity,planner_date,start_time,end_time,status,created_at,updated_at,weekly_entry_id,homework_id',
  users:
    'id,email,name,phone,role,password_hash,institution_id,is_active,package,start_date,end_date,created_at,updated_at,created_by,roles,tc_identity_no,academic_year_label,last_login_at',
  junior_vip_events: 'id,event_type,intent,code,panel,actor_hash,detail,created_at',
  junior_vip_budget_settings: 'id,monthly_limit_usd,safety_margin_usd,max_in_flight,updated_at',
  junior_vip_ai_ledger:
    'id,month_key,service,provider,model,status,reserved_usd,actual_usd,input_tokens,output_tokens,audio_seconds,panel,error_code,created_at,settled_at'
};

const SETS = Object.fromEntries(
  Object.entries(JUNIOR_VIP_DB_COLUMNS).map(([t, cols]) => [t, new Set(cols.split(','))])
);

/** select('a,b,c') kolonları canlı şemada yoksa PostgREST benzeri hata mesajı döner; yoksa null. */
export function unknownSelectColumnError(table, selectArg) {
  const set = SETS[table];
  const sel = String(selectArg ?? '*').trim();
  if (!set || !sel || sel === '*') return null;
  for (const raw of sel.split(',')) {
    const col = raw.trim().split(':').pop().split('(')[0].trim();
    if (!col || col === '*' || col.includes('!')) continue;
    if (!set.has(col)) return `column ${table}.${col} does not exist`;
  }
  return null;
}
