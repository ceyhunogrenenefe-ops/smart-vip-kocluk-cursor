import React, { useCallback, useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/session';
import { useAuth } from '../context/AuthContext';

type ProfilePayload = {
  user: { id: string; name: string; email: string; phone?: string | null; role: string };
  student?: { id: string; name: string; email?: string } | null;
  coach?: { id: string; name: string; email?: string } | null;
};

export default function MyProfilePage() {
  const { user, effectiveUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/my-profile');
      const j = (await res.json()) as ProfilePayload & { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setName(j.user?.name || '');
      setEmail(j.user?.email || '');
      setPhone(String(j.user?.phone || ''));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Profil yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password.length < 6) {
      toast.error('Şifre en az 6 karakter olmalı');
      return;
    }
    if (password && password !== confirmPassword) {
      toast.error('Şifreler eşleşmiyor');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim()
      };
      if (password) body.password = password;
      const res = await apiFetch('/api/my-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error || res.statusText);
      setPassword('');
      setConfirmPassword('');
      toast.success('Profiliniz güncellendi');
      const stored = localStorage.getItem('coaching_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { name?: string; email?: string };
          parsed.name = name.trim();
          parsed.email = email.trim().toLowerCase();
          localStorage.setItem('coaching_user', JSON.stringify(parsed));
        } catch {
          /* ignore */
        }
      }
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const displayName = effectiveUser?.name || user?.name || 'Kullanıcı';

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Profilim</h1>
            <p className="text-sm text-slate-500">Ad, e-posta, telefon ve şifrenizi güncelleyin</p>
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Yükleniyor…
          </p>
        ) : (
          <form onSubmit={(ev) => void onSave(ev)} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Ad soyad</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                placeholder="05xx xxx xx xx"
              />
            </div>
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50">
              <p className="mb-2 text-xs font-medium text-slate-600">Şifre değiştir (isteğe bağlı)</p>
              <div className="space-y-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Yeni şifre"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Yeni şifre tekrar"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Kaydet
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
