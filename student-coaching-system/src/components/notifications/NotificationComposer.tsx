import React, { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  createNotification,
  ROLE_LABELS,
  TARGET_TYPE_LABELS,
  type NotificationComposerRole
} from '../../services/notificationService';
import {
  canSenderUseTargetType,
  canSenderTargetRole,
  validateCreateNotificationPayload,
  type CreateNotificationInput,
  type NotificationTargetType,
  type PlatformRole
} from '../../types/notification.types';

type NotificationComposerProps = {
  senderRole: NotificationComposerRole;
  onSent?: () => void;
};

const TARGET_TYPES: NotificationTargetType[] = ['broadcast', 'role', 'user'];

export default function NotificationComposer({ senderRole, onSent }: NotificationComposerProps) {
  const { user, getAllUsers } = useAuth();
  const { students } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<NotificationTargetType>('role');
  const [targetRole, setTargetRole] = useState<PlatformRole>('student');
  const [targetUserId, setTargetUserId] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const allowedTargetTypes = useMemo(
    () => TARGET_TYPES.filter((t) => canSenderUseTargetType(senderRole, t)),
    [senderRole]
  );

  const allowedRoles = useMemo(() => {
    const all: PlatformRole[] = ['student', 'teacher', 'coach', 'admin'];
    return all.filter((r) => canSenderTargetRole(senderRole, r));
  }, [senderRole]);

  const studentOptions = useMemo(() => {
    if (senderRole !== 'coach') return [];
    return students
      .map((s) => {
        const uid = s.platformUserId || s.authUserId || '';
        return { id: uid, label: s.name || s.email || uid };
      })
      .filter((s) => s.id);
  }, [senderRole, students]);

  const adminUserOptions = useMemo(() => {
    if (senderRole !== 'admin' && senderRole !== 'super_admin') return [];
    const inst = user?.institutionId;
    return getAllUsers()
      .filter((u) => {
        if (u.role === 'super_admin') return senderRole === 'super_admin';
        if (senderRole === 'super_admin') return true;
        return inst ? u.institutionId === inst : true;
      })
      .map((u) => ({ id: u.id, label: `${u.name} (${ROLE_LABELS[u.role]})` }));
  }, [senderRole, user?.institutionId, getAllUsers]);

  const validationError = useMemo(() => {
    const payload: CreateNotificationInput = {
      title,
      body,
      target_type: targetType,
      target_role: targetType === 'role' ? targetRole : undefined,
      target_user_id: targetType === 'user' ? targetUserId : undefined,
      target_institution_id: user?.institutionId || undefined,
      priority,
      link_url: linkUrl || undefined
    };
    return validateCreateNotificationPayload(senderRole, user?.institutionId, payload);
  }, [
    title,
    body,
    targetType,
    targetRole,
    targetUserId,
    user?.institutionId,
    priority,
    linkUrl,
    senderRole
  ]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setBusy(true);
    try {
      const payload: CreateNotificationInput = {
        title: title.trim(),
        body: body.trim(),
        target_type: targetType,
        priority,
        link_url: linkUrl.trim() || undefined
      };
      if (targetType === 'role') {
        payload.target_role = targetRole;
        if (user?.institutionId) payload.target_institution_id = user.institutionId;
      }
      if (targetType === 'user') payload.target_user_id = targetUserId;
      if (targetType === 'broadcast' && user?.institutionId) {
        payload.target_institution_id = user.institutionId;
      }

      await createNotification(payload);
      toast.success('Bildirim gönderildi.');
      setTitle('');
      setBody('');
      setLinkUrl('');
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Bildirim gönder</h2>
        <p className="text-xs text-slate-500">
          {senderRole === 'coach'
            ? 'Yalnızca kendi öğrencilerinize veya öğrenci rolüne.'
            : 'Kurum içi hedef kitleye duyuru oluşturun.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Başlık</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            maxLength={200}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Öncelik</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="low">Düşük</option>
            <option value="normal">Normal</option>
            <option value="high">Yüksek</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Mesaj</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Hedef türü</span>
        <select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as NotificationTargetType)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          {allowedTargetTypes.map((t) => (
            <option key={t} value={t}>
              {TARGET_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {targetType === 'role' ? (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Hedef rol</span>
          <select
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as PlatformRole)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            {allowedRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {targetType === 'user' ? (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">
            {senderRole === 'coach' ? 'Öğrenci' : 'Kullanıcı ID'}
          </span>
          {(senderRole === 'coach' && studentOptions.length > 0) ||
          ((senderRole === 'admin' || senderRole === 'super_admin') &&
            adminUserOptions.length > 0) ? (
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              required
            >
              <option value="">Seçin…</option>
              {(senderRole === 'coach' ? studentOptions : adminUserOptions).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="Kullanıcı UUID"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              required
            />
          )}
        </label>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Bağlantı (isteğe bağlı)</span>
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          type="url"
          placeholder="https://…"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
      </label>

      {validationError ? (
        <p className="text-xs text-amber-700">{validationError}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy || Boolean(validationError)}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Gönder
      </button>
    </form>
  );
}
