/**
 * Central permission catalog for Online VIP CRM RBAC.
 * Use these string keys everywhere — never hard-code role checks in features.
 */
export const PERMISSIONS = {
  // Inbox / conversations
  INBOX_VIEW: 'inbox.view',
  INBOX_REPLY: 'inbox.reply',
  CONVERSATION_ASSIGN: 'conversation.assign',
  CONVERSATION_UPDATE: 'conversation.update',
  CONVERSATION_ARCHIVE: 'conversation.archive',

  // Contacts
  CONTACT_VIEW: 'contact.view',
  CONTACT_CREATE: 'contact.create',
  CONTACT_UPDATE: 'contact.update',
  CONTACT_MERGE: 'contact.merge',
  CONTACT_DELETE: 'contact.delete',

  // Leads / sales
  LEAD_VIEW: 'lead.view',
  LEAD_CREATE: 'lead.create',
  LEAD_UPDATE: 'lead.update',
  LEAD_DELETE: 'lead.delete',
  PIPELINE_MANAGE: 'pipeline.manage',

  // Tasks
  TASK_MANAGE: 'task.manage',
  TASK_VIEW: 'task.view',

  // Reports
  REPORT_VIEW: 'report.view',

  // Integrations / channels
  INTEGRATION_MANAGE: 'integration.manage',
  INTEGRATION_VIEW: 'integration.view',

  // Users & roles
  USER_MANAGE: 'user.manage',
  USER_VIEW: 'user.view',
  ROLE_MANAGE: 'role.manage',

  // Institution
  INSTITUTION_MANAGE: 'institution.manage',
  INSTITUTION_SETTINGS: 'institution.settings',
  INSTITUTION_VIEW: 'institution.view',

  // Platform (super admin)
  PLATFORM_MANAGE: 'platform.manage',
  PLATFORM_SUPPORT_ACCESS: 'platform.support_access',

  // Audit / compliance
  AUDIT_VIEW: 'audit.view',
  CONSENT_MANAGE: 'consent.manage',

  // Templates & canned responses
  TEMPLATE_MANAGE: 'template.manage',
  CANNED_RESPONSE_MANAGE: 'canned_response.manage',

  // Notifications
  NOTIFICATION_VIEW: 'notification.view',

  // Files
  FILE_MANAGE: 'file.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(
  Object.values(PERMISSIONS),
);

export const PERMISSION_CATALOG: ReadonlyArray<{
  key: Permission;
  group: string;
  description: string;
}> = [
  { key: PERMISSIONS.INBOX_VIEW, group: 'inbox', description: 'Gelen kutusunu görüntüle' },
  { key: PERMISSIONS.INBOX_REPLY, group: 'inbox', description: 'Mesajlara yanıt ver' },
  { key: PERMISSIONS.CONVERSATION_ASSIGN, group: 'inbox', description: 'Konuşma ata' },
  { key: PERMISSIONS.CONVERSATION_UPDATE, group: 'inbox', description: 'Konuşma güncelle' },
  { key: PERMISSIONS.CONVERSATION_ARCHIVE, group: 'inbox', description: 'Konuşma arşivle' },
  { key: PERMISSIONS.CONTACT_VIEW, group: 'contact', description: 'Kişileri görüntüle' },
  { key: PERMISSIONS.CONTACT_CREATE, group: 'contact', description: 'Kişi oluştur' },
  { key: PERMISSIONS.CONTACT_UPDATE, group: 'contact', description: 'Kişi güncelle' },
  { key: PERMISSIONS.CONTACT_MERGE, group: 'contact', description: 'Kişi birleştir' },
  { key: PERMISSIONS.CONTACT_DELETE, group: 'contact', description: 'Kişi sil' },
  { key: PERMISSIONS.LEAD_VIEW, group: 'lead', description: 'Lead görüntüle' },
  { key: PERMISSIONS.LEAD_CREATE, group: 'lead', description: 'Lead oluştur' },
  { key: PERMISSIONS.LEAD_UPDATE, group: 'lead', description: 'Lead güncelle' },
  { key: PERMISSIONS.LEAD_DELETE, group: 'lead', description: 'Lead sil' },
  { key: PERMISSIONS.PIPELINE_MANAGE, group: 'lead', description: 'Satış hattını yönet' },
  { key: PERMISSIONS.TASK_VIEW, group: 'task', description: 'Görevleri görüntüle' },
  { key: PERMISSIONS.TASK_MANAGE, group: 'task', description: 'Görevleri yönet' },
  { key: PERMISSIONS.REPORT_VIEW, group: 'report', description: 'Raporları görüntüle' },
  { key: PERMISSIONS.INTEGRATION_VIEW, group: 'integration', description: 'Entegrasyonları görüntüle' },
  { key: PERMISSIONS.INTEGRATION_MANAGE, group: 'integration', description: 'Entegrasyonları yönet' },
  { key: PERMISSIONS.USER_VIEW, group: 'user', description: 'Kullanıcıları görüntüle' },
  { key: PERMISSIONS.USER_MANAGE, group: 'user', description: 'Kullanıcıları yönet' },
  { key: PERMISSIONS.ROLE_MANAGE, group: 'user', description: 'Rolleri yönet' },
  { key: PERMISSIONS.INSTITUTION_VIEW, group: 'institution', description: 'Kurumu görüntüle' },
  { key: PERMISSIONS.INSTITUTION_SETTINGS, group: 'institution', description: 'Kurum ayarlarını değiştir' },
  { key: PERMISSIONS.INSTITUTION_MANAGE, group: 'institution', description: 'Kurumu yönet' },
  { key: PERMISSIONS.PLATFORM_MANAGE, group: 'platform', description: 'Platform yönetimi' },
  { key: PERMISSIONS.PLATFORM_SUPPORT_ACCESS, group: 'platform', description: 'Destek erişimi' },
  { key: PERMISSIONS.AUDIT_VIEW, group: 'audit', description: 'Denetim kayıtlarını görüntüle' },
  { key: PERMISSIONS.CONSENT_MANAGE, group: 'audit', description: 'KVKK onaylarını yönet' },
  { key: PERMISSIONS.TEMPLATE_MANAGE, group: 'content', description: 'Mesaj şablonlarını yönet' },
  { key: PERMISSIONS.CANNED_RESPONSE_MANAGE, group: 'content', description: 'Hazır cevapları yönet' },
  { key: PERMISSIONS.NOTIFICATION_VIEW, group: 'notification', description: 'Bildirimleri görüntüle' },
  { key: PERMISSIONS.FILE_MANAGE, group: 'file', description: 'Dosyaları yönet' },
];
