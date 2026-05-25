/** Sunucu tarafı bildirim hedef doğrulama ve alıcı eşleşmesi */

const SENDER_ROLES = new Set(['super_admin', 'admin', 'coach', 'teacher']);

export function canRoleSendNotifications(role) {
  return SENDER_ROLES.has(String(role || '').trim().toLowerCase());
}

function isCoachLikeSender(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'coach' || r === 'teacher';
}

export function canSenderUseTargetType(senderRole, targetType) {
  const r = String(senderRole || '').trim().toLowerCase();
  if (!canRoleSendNotifications(r)) return false;
  if (r === 'super_admin' || r === 'admin') return true;
  if (isCoachLikeSender(r)) return targetType === 'user' || targetType === 'role';
  return false;
}

export function canSenderTargetRole(senderRole, targetRole) {
  const s = String(senderRole || '').trim().toLowerCase();
  const t = String(targetRole || '').trim();
  if (!canRoleSendNotifications(s)) return false;
  if (s === 'super_admin') return true;
  if (s === 'admin') return t !== 'super_admin';
  if (isCoachLikeSender(s)) return t === 'student';
  return false;
}

export function validateCreateNotificationPayload(senderRole, senderInstitutionId, input) {
  const title = String(input?.title || '').trim();
  const body = String(input?.body || '').trim();
  if (!title) return 'title_required';
  if (!body) return 'body_required';
  if (title.length > 200) return 'title_too_long';
  if (body.length > 4000) return 'body_too_long';

  const targetType = String(input?.target_type || '').trim();
  if (!canSenderUseTargetType(senderRole, targetType)) return 'forbidden_target_type';

  const inst = senderInstitutionId ? String(senderInstitutionId).trim() : '';

  if (targetType === 'broadcast') {
    if (senderRole === 'admin' && !inst) return 'institution_required';
    if (senderRole === 'admin' && input?.target_institution_id) {
      const tInst = String(input.target_institution_id).trim();
      if (tInst && tInst !== inst) return 'institution_mismatch';
    }
    if (isCoachLikeSender(senderRole)) return 'coach_no_broadcast';
    return null;
  }

  if (targetType === 'role') {
    const tr = String(input?.target_role || '').trim();
    if (!tr) return 'target_role_required';
    if (!canSenderTargetRole(senderRole, tr)) return 'forbidden_target_role';
    if (senderRole === 'admin') {
      if (!inst) return 'institution_required';
      const tInst = input?.target_institution_id
        ? String(input.target_institution_id).trim()
        : inst;
      if (tInst !== inst) return 'institution_mismatch';
    }
    return null;
  }

  if (targetType === 'user') {
    const uid = String(input?.target_user_id || '').trim();
    if (!uid) return 'target_user_required';
    if (
      isCoachLikeSender(senderRole) ||
      senderRole === 'admin' ||
      senderRole === 'super_admin'
    ) {
      return null;
    }
    return 'forbidden_user_target';
  }

  return 'invalid_target_type';
}

function recipientRoleSet(recipient) {
  const set = new Set();
  const primary = String(recipient?.role || '').trim();
  if (primary) set.add(primary);
  if (Array.isArray(recipient?.roles)) {
    recipient.roles.forEach((r) => {
      const v = String(r || '').trim();
      if (v) set.add(v);
    });
  }
  return set;
}

function notificationInstitutionId(notification) {
  const target = notification?.target_institution_id
    ? String(notification.target_institution_id).trim()
    : '';
  const sender = notification?.institution_id ? String(notification.institution_id).trim() : '';
  return target || sender || '';
}

export function notificationMatchesRecipient(notification, recipient) {
  const userId = String(recipient?.userId || '').trim();
  const roles = recipientRoleSet(recipient);
  const inst = recipient?.institutionId ? String(recipient.institutionId).trim() : '';
  const nInst = notificationInstitutionId(notification);
  const altIds = Array.isArray(recipient?.altUserIds)
    ? recipient.altUserIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  if (notification.target_type === 'user') {
    const tid = String(notification.target_user_id || '').trim();
    if (!tid) return false;
    if (tid === userId) return true;
    return altIds.includes(tid);
  }

  if (notification.target_type === 'role') {
    const tr = String(notification.target_role || '').trim();
    if (!tr || !roles.has(tr)) return false;
    if (roles.has('super_admin')) return true;
    if (!nInst) return true;
    if (!inst) return false;
    return inst === nInst;
  }

  if (notification.target_type === 'broadcast') {
    if (roles.has('super_admin')) return true;
    if (!nInst) return !roles.has('super_admin');
    if (!inst) return false;
    return inst === nInst;
  }

  return false;
}
