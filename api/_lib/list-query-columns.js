/** Liste uçları: gereksiz ağır sütunları (password_hash, student_ids) hariç tutar. */

export const USER_LIST_COLUMNS =
  'id,name,email,phone,role,roles,institution_id,package,start_date,end_date,is_active,created_at,updated_at,created_by';

export const STUDENT_LIST_COLUMNS =
  'id,name,email,phone,class_level,school,parent_name,parent_phone,coach_id,institution_id,platform_user_id,user_id,birth_date,whatsapp_automation_enabled,program_id,created_at,updated_at';

export const COACH_LIST_COLUMNS =
  'id,name,email,phone,institution_id,specialties,created_at,updated_at';
