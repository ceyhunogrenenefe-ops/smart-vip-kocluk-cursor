/**
 * Yoklama Meta şablonlarını DB’ye yazar, WABA’da yoksa oluşturur, APPROVED olanları hizalar.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb, metaWhatsAppConfigured } from './meta-whatsapp.js';
import {
  fetchMetaTemplatesFromPhoneWaba,
  isMetaTemplateSendableStatus
} from './meta-templates-sync.js';
import { buildMetaTemplateCreatePayload, createOrReuseMetaMessageTemplate } from './meta-template-create.js';

export const ATTENDANCE_META_SEED = [
  {
    type: 'class_absent_notice_1',
    name: 'Yoklama — katılmayan öğrenci (veli)',
    content:
      'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmamıştır. Bilginize.',
    variables: ['student_name', 'subject']
  },
  {
    type: 'class_camera_off_notice',
    name: 'Yoklama — kamerası kapalı öğrenci (veli)',
    content:
      'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmış ancak ders sırasında kamerasını açmamıştır. Bilginize.',
    variables: ['student_name', 'subject']
  },
  {
    type: 'attendance_status_update',
    name: 'Yoklama durumu güncelleme (veli — geç katıldı)',
    content:
      '🕐 YOKLAMA GÜNCELLEMESİ\nÖğrenci: {{student_name}}\nSınıf: {{class_name}}\nDers: {{lesson_name}}\nÖğrencimiz derse geç katılmıştır.\nDurum: {{attendance_status}}\nKamera: {{camera_status}}',
    variables: [
      'student_name',
      'class_name',
      'lesson_name',
      'attendance_status',
      'camera_status'
    ]
  },
  {
    type: 'coach_lesson_attendance_summary',
    name: 'Koç ders yoklama özeti',
    content:
      '📋 DERS YOKLAMA RAPORU\n🏫 Sınıf: {{class_name}}\n📚 Ders: {{lesson_name}}\n👨‍🏫 Öğretmen: {{teacher_name}}\n👤 Koç: {{coach_name}}\n📅 {{lesson_date_time}}\n👥 Toplam: {{total_students}}\n✅ Katılan: {{present_count}}\n🕐 Geç: {{late_count}}\n❌ Katılmayan: {{absent_count}}\n🎥 Kamera açık: {{camera_open_count}}\n🚫 Kamera kapalı: {{camera_closed_count}}\n\n✅ KATILAN\n{{present_students}}\n\n🕐 GEÇ KATILAN\n{{late_students}}\n\n❌ KATILMAYAN\n{{absent_students}}\n\n🎥 KAMERA AÇIK\n{{camera_open_students}}\n\n🚫 KAMERA KAPALI\n{{camera_closed_students}}\n\nOnline VIP Dershane',
    variables: [
      'class_name',
      'lesson_name',
      'teacher_name',
      'coach_name',
      'lesson_date_time',
      'total_students',
      'present_count',
      'late_count',
      'absent_count',
      'camera_open_count',
      'camera_closed_count',
      'present_students',
      'late_students',
      'absent_students',
      'camera_open_students',
      'camera_closed_students'
    ]
  },
  {
    type: 'attendance_coach_late_update',
    name: 'Koç yoklama güncelleme (geç katılım)',
    content:
      '🕐 YOKLAMA GÜNCELLEMESİ\n🏫 {{class_name}}\n📚 {{lesson_name}}\n{{student_name}} daha önce “Katılmadı” olarak işaretlenmişti.\nGüncel durum: {{attendance_status}}\nKamera: {{camera_status}}\nGüncel katılım: {{present_total}}',
    variables: [
      'class_name',
      'lesson_name',
      'student_name',
      'attendance_status',
      'camera_status',
      'present_total'
    ]
  }
];

async function upsertSeedRow(seed) {
  const row = {
    name: seed.name,
    type: seed.type,
    content: seed.content,
    variables: seed.variables,
    twilio_variable_bindings: seed.variables,
    channel: 'whatsapp',
    is_active: true,
    meta_template_name: seed.type,
    meta_template_language: 'tr',
    meta_named_body_parameters: true,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .upsert(row, { onConflict: 'type' })
    .select('id, type, meta_template_name, meta_template_language, whatsapp_template_status, content')
    .maybeSingle();
  if (error) return { ok: false, type: seed.type, error: error.message };
  return { ok: true, type: seed.type, row: data };
}

/**
 * @param {{ submitMissing?: boolean }} opts
 */
export async function ensureAttendanceMetaTemplates(opts = {}) {
  const submitMissing = opts.submitMissing !== false;
  await loadMetaWhatsAppSecretsFromDb();
  const metaReady = metaWhatsAppConfigured();

  const upserts = [];
  for (const seed of ATTENDANCE_META_SEED) {
    upserts.push(await upsertSeedRow(seed));
  }

  const results = [];
  for (const seed of ATTENDANCE_META_SEED) {
    const up = upserts.find((u) => u.type === seed.type);
    /** @type {Record<string, unknown>} */
    const entry = {
      type: seed.type,
      db_upsert_ok: Boolean(up?.ok),
      db_id: up?.row?.id || null,
      db_error: up?.ok ? null : up?.error || null,
      meta_ready: metaReady,
      meta_found: false,
      meta_status: null,
      meta_language: null,
      meta_approved: false,
      submitted: null,
      synced: false,
      hint: null
    };

    if (!metaReady) {
      entry.hint = 'meta_not_configured';
      results.push(entry);
      continue;
    }

    try {
      const phone = await fetchMetaTemplatesFromPhoneWaba(seed.type, { includeComponents: false });
      const matches = phone.ok ? phone.matches || [] : [];
      const approved =
        matches.find(
          (m) =>
            isMetaTemplateSendableStatus(m.status) &&
            String(m.language || '')
              .toLowerCase()
              .startsWith('tr')
        ) ||
        matches.find((m) => isMetaTemplateSendableStatus(m.status)) ||
        null;
      const any = approved || matches[0] || null;

      if (any) {
        entry.meta_found = true;
        entry.meta_status = String(any.status || '').toUpperCase() || null;
        entry.meta_language = any.language || null;
        entry.meta_approved = isMetaTemplateSendableStatus(any.status);
      }

      if (entry.meta_approved && up?.row?.id) {
        const { error: syncErr } = await supabaseAdmin
          .from('message_templates')
          .update({
            meta_template_name: seed.type,
            meta_template_language: entry.meta_language || 'tr',
            whatsapp_template_status: String(entry.meta_status || 'APPROVED'),
            whatsapp_template_synced_at: new Date().toISOString(),
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', up.row.id);
        entry.synced = !syncErr;
        if (syncErr) entry.hint = syncErr.message;
      } else if (!entry.meta_found && submitMissing) {
        let payload;
        try {
          payload = buildMetaTemplateCreatePayload({
            name: seed.type,
            language: 'tr',
            category: 'UTILITY',
            bodyText: seed.content
          });
        } catch (e) {
          entry.hint = e instanceof Error ? e.message : String(e);
          results.push(entry);
          continue;
        }
        const submitted = await createOrReuseMetaMessageTemplate(payload);
        entry.submitted = {
          ok: submitted.ok,
          created: submitted.created || false,
          reused: submitted.reused || false,
          status: submitted.status || null,
          approved: submitted.approved || false,
          error: submitted.ok ? null : submitted.error || null
        };
        if (submitted.ok && up?.row?.id) {
          await supabaseAdmin
            .from('message_templates')
            .update({
              meta_template_name: submitted.name || seed.type,
              meta_template_language: submitted.language || 'tr',
              whatsapp_template_status: String(submitted.status || 'PENDING'),
              whatsapp_template_synced_at: new Date().toISOString(),
              is_active: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', up.row.id);
          entry.synced = true;
          entry.meta_found = true;
          entry.meta_status = String(submitted.status || '').toUpperCase() || null;
          entry.meta_approved = Boolean(submitted.approved);
          entry.hint = submitted.approved
            ? null
            : `Meta’ya gönderildi — durum: ${submitted.status || 'PENDING'} (onay bekleniyor olabilir)`;
        } else if (!submitted.ok) {
          entry.hint = submitted.error || 'meta_submit_failed';
        }
      } else if (!entry.meta_found) {
        entry.hint = `WABA'da "${seed.type}" yok`;
      } else if (!entry.meta_approved) {
        entry.hint = `Meta durumu gönderime uygun değil: ${entry.meta_status}`;
      }
    } catch (e) {
      entry.hint = e instanceof Error ? e.message : String(e);
    }

    results.push(entry);
  }

  const ready = results.filter((r) => r.meta_approved && r.db_upsert_ok);
  return {
    ok: ready.length === ATTENDANCE_META_SEED.length,
    deployMarker: 'attendance-meta-ensure-2026-09-10',
    ready_count: ready.length,
    total: ATTENDANCE_META_SEED.length,
    camera_off_ready: Boolean(
      results.find((r) => r.type === 'class_camera_off_notice')?.meta_approved
    ),
    templates: results
  };
}
