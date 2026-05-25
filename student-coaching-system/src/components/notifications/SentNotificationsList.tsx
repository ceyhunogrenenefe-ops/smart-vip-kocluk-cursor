import React, { useState } from 'react';
import { Loader2, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { NotificationPriority, PlatformNotification } from '../../types/notification.types';
import {
  deleteNotification,
  describeNotificationTarget,
  updateNotification
} from '../../services/notificationService';

type Props = {
  items: PlatformNotification[];
  loading: boolean;
  onChanged: () => void;
};

export default function SentNotificationsList({ items, loading, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('normal');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const startEdit = (n: PlatformNotification) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setPriority(n.priority || 'normal');
    setLinkUrl(n.link_url || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setLinkUrl('');
    setPriority('normal');
  };

  const onSave = async () => {
    if (!editingId) return;
    if (!title.trim() || !body.trim()) {
      toast.error('Başlık ve mesaj zorunlu');
      return;
    }
    setBusy(true);
    try {
      await updateNotification(editingId, {
        title: title.trim(),
        body: body.trim(),
        priority,
        link_url: linkUrl.trim() || null
      });
      toast.success('Bildirim güncellendi');
      cancelEdit();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (n: PlatformNotification) => {
    if (!window.confirm(`「${n.title}」 bildirimini silmek istediğinize emin misiniz?`)) return;
    setBusy(true);
    try {
      await deleteNotification(n.id);
      toast.success('Bildirim silindi');
      if (editingId === n.id) cancelEdit();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Yükleniyor…
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Henüz gönderilmiş bildirim yok.</p>;
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
      {items.map((n) => {
        const isEditing = editingId === n.id;
        return (
          <li key={n.id} className="px-4 py-3">
            {isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-700">Düzenle</span>
                  <button type="button" onClick={cancelEdit} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Başlık"
                  maxLength={200}
                />
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm min-h-[80px] dark:bg-slate-800 dark:border-slate-600"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Mesaj"
                  maxLength={4000}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Öncelik
                    <select
                      className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm dark:bg-slate-800"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as NotificationPriority)}
                    >
                      <option value="low">Düşük</option>
                      <option value="normal">Normal</option>
                      <option value="high">Yüksek</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Link (isteğe bağlı)
                    <input
                      className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm dark:bg-slate-800"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-slate-500">
                  Hedef kitle değiştirilemez: {describeNotificationTarget(n)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onSave()}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {busy ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={cancelEdit}
                    className="rounded-lg border px-4 py-2 text-sm text-slate-600"
                  >
                    İptal
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                    {n.body}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {describeNotificationTarget(n)} ·{' '}
                    {n.priority !== 'normal' ? `${n.priority} · ` : ''}
                    {new Date(n.created_at).toLocaleString('tr-TR')}
                  </p>
                  {n.link_url ? (
                    <p className="mt-0.5 text-xs text-indigo-600 truncate">{n.link_url}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Düzenle"
                    disabled={busy}
                    onClick={() => startEdit(n)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-violet-700 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Sil"
                    disabled={busy}
                    onClick={() => void onDelete(n)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
