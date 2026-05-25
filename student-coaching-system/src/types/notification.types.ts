/** Platform bildirim rolleri — yetki matrisi bu dosyada sabitlenir. */
export type PlatformRole = 'super_admin' | 'admin' | 'coach' | 'teacher' | 'student';

export type NotificationTargetType = 'broadcast' | 'role' | 'user';

export type NotificationPriority = 'low' | 'normal' | 'high';

export interface PlatformNotification {
  id: string;
  title: string;
  body: string;
  sender_user_id: string;
  sender_role: PlatformRole;
  sender_name: string | null;
  institution_id: string | null;
  target_type: NotificationTargetType;
  target_role: PlatformRole | null;
  target_user_id: string | null;
  target_institution_id: string | null;
  priority: NotificationPriority;
  link_url: string | null;
  created_at: string;
  read_at?: string | null;
}

export interface CreateNotificationInput {
  title: string;
  body: string;
  target_type: NotificationTargetType;
  target_role?: PlatformRole;
  target_user_id?: string;
  target_institution_id?: string;
  priority?: NotificationPriority;
  link_url?: string;
}

/** Gönderilmiş bildirimi düzenleme — hedef kitle değiştirilemez */
export interface UpdateNotificationInput {
  title?: string;
  body?: string;
  priority?: NotificationPriority;
  link_url?: string | null;
}

const SENDER_ROLES: readonly PlatformRole[] = ['super_admin', 'admin', 'coach'];

export function canRoleSendNotifications(role: PlatformRole): boolean {
  return (SENDER_ROLES as readonly string[]).includes(role);
}

/** Gönderen bu hedef türünü kullanabilir mi? */
export function canSenderUseTargetType(
  senderRole: PlatformRole,
  targetType: NotificationTargetType
): boolean {
  if (!canRoleSendNotifications(senderRole)) return false;
  if (senderRole === 'super_admin') return true;
  if (senderRole === 'admin') return true;
  if (senderRole === 'coach') {
    return targetType === 'user' || targetType === 'role';
  }
  return false;
}

/** Gönderen bu hedef role yazabilir mi? */
export function canSenderTargetRole(senderRole: PlatformRole, targetRole: PlatformRole): boolean {
  if (!canRoleSendNotifications(senderRole)) return false;
  if (senderRole === 'super_admin') return true;
  if (senderRole === 'admin') {
    return targetRole !== 'super_admin';
  }
  if (senderRole === 'coach') {
    return targetRole === 'student';
  }
  return false;
}

/**
 * Oluşturma isteği doğrulama — hata metni veya null (geçerli).
 * Sunucu aynı kuralları tekrar uygular.
 */
export function validateCreateNotificationPayload(
  senderRole: PlatformRole,
  senderInstitutionId: string | null | undefined,
  input: CreateNotificationInput
): string | null {
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (!title) return 'Başlık zorunludur.';
  if (!body) return 'Mesaj zorunludur.';
  if (title.length > 200) return 'Başlık en fazla 200 karakter olabilir.';
  if (body.length > 4000) return 'Mesaj en fazla 4000 karakter olabilir.';

  const targetType = input.target_type;
  if (!canSenderUseTargetType(senderRole, targetType)) {
    return 'Bu hedef türü için yetkiniz yok.';
  }

  const inst = senderInstitutionId ? String(senderInstitutionId).trim() : '';

  if (targetType === 'broadcast') {
    if (senderRole === 'admin' && !inst) {
      return 'Kurum yöneticisi için kurum bilgisi gerekli.';
    }
    if (senderRole === 'admin' && input.target_institution_id) {
      const tInst = String(input.target_institution_id).trim();
      if (tInst && tInst !== inst) {
        return 'Yalnızca kendi kurumunuza yayın yapabilirsiniz.';
      }
    }
    if (senderRole === 'coach') {
      return 'Koçlar kurum geneli yayın yapamaz.';
    }
    return null;
  }

  if (targetType === 'role') {
    const tr = input.target_role;
    if (!tr) return 'Hedef rol seçin.';
    if (!canSenderTargetRole(senderRole, tr)) {
      return 'Bu role bildirim gönderemezsiniz.';
    }
    if (senderRole === 'admin') {
      if (!inst) return 'Kurum bilgisi gerekli.';
      const tInst = input.target_institution_id
        ? String(input.target_institution_id).trim()
        : inst;
      if (tInst !== inst) return 'Yalnızca kendi kurumunuzdaki rollere gönderebilirsiniz.';
    }
    if (senderRole === 'coach' && tr !== 'student') {
      return 'Koçlar yalnızca öğrenci rolüne gönderebilir.';
    }
    return null;
  }

  if (targetType === 'user') {
    const uid = String(input.target_user_id || '').trim();
    if (!uid) return 'Hedef kullanıcı seçin.';
    if (senderRole === 'coach') return null;
    if (senderRole === 'admin' || senderRole === 'super_admin') return null;
    return 'Kullanıcı hedefi için yetkiniz yok.';
  }

  return 'Geçersiz hedef türü.';
}

/** Alıcı eşleşmesi (istemci önizleme / sunucu ile uyumlu) */
export function notificationMatchesRecipient(
  notification: Pick<
    PlatformNotification,
    | 'target_type'
    | 'target_role'
    | 'target_user_id'
    | 'target_institution_id'
    | 'institution_id'
  >,
  recipient: {
    userId: string;
    role: PlatformRole;
    roles?: PlatformRole[];
    institutionId?: string | null;
    altUserIds?: string[];
  }
): boolean {
  const userId = String(recipient.userId || '').trim();
  const roleSet = new Set<PlatformRole>([recipient.role]);
  if (recipient.roles?.length) recipient.roles.forEach((r) => roleSet.add(r));
  const inst = recipient.institutionId ? String(recipient.institutionId).trim() : '';
  const nInst = notification.target_institution_id
    ? String(notification.target_institution_id).trim()
    : notification.institution_id
      ? String(notification.institution_id).trim()
      : '';
  const altIds = recipient.altUserIds || [];

  if (notification.target_type === 'user') {
    const tid = String(notification.target_user_id || '').trim();
    return tid === userId || altIds.includes(tid);
  }

  if (notification.target_type === 'role') {
    const tr = notification.target_role;
    if (!tr || !roleSet.has(tr)) return false;
    if (roleSet.has('super_admin')) return true;
    if (!nInst) return true;
    return Boolean(inst && inst === nInst);
  }

  if (notification.target_type === 'broadcast') {
    if (roleSet.has('super_admin')) return true;
    if (!nInst) return !roleSet.has('super_admin');
    return Boolean(inst && inst === nInst);
  }

  return false;
}
