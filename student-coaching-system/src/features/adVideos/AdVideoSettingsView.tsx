import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, HardDrive, Loader2, Save, Search, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { matchesSearch } from '../../lib/turkishSearch';
import { adVideosApi, type AdVideoSettings, type PersonOption } from './api';

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const section = 'space-y-3 rounded-2xl border border-slate-200 bg-white p-4';
const GUN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function AdVideoSettingsView({ onSaved }: { onSaved: () => void }) {
  const [s, setS] = useState<AdVideoSettings | null>(null);
  const [drive, setDrive] = useState<{ credentials_configured: boolean; upload_effective: boolean } | null>(null);
  const [staff, setStaff] = useState<PersonOption[]>([]);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    Promise.all([adVideosApi.settings(), adVideosApi.staff()])
      .then(([a, b]) => {
        setS(a.settings);
        setDrive(a.drive);
        setStaff(b.staff);
      })
      .catch((e) => toast.error(e.message));

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => staff.filter((p) => matchesSearch(`${p.name} ${p.email || ''}`, q)), [staff, q]);

  if (!s) {
    return (
      <div className="flex justify-center py-12 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const patch = (p: Partial<AdVideoSettings>) => setS({ ...s, ...p });
  const editors = new Set(s.editor_user_ids);

  const save = async () => {
    setSaving(true);
    try {
      await adVideosApi.saveSettings({
        editor_user_ids: s.editor_user_ids,
        drive_upload_enabled: s.drive_upload_enabled,
        drive_shared_drive_id: s.drive_shared_drive_id || '',
        drive_folder_id: s.drive_folder_id || '',
        link_folder_url: s.link_folder_url || '',
        daily_summary_enabled: s.daily_summary_enabled,
        daily_summary_time: s.daily_summary_time,
        daily_summary_days: s.daily_summary_days
      });
      toast.success('Ayarlar kaydedildi');
      await load();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      const r = await adVideosApi.driveCheck();
      setCheck({ ok: true, text: `Bağlantı çalışıyor · klasör: ${r.folder?.name || r.folder?.id}` });
    } catch (e) {
      setCheck({ ok: false, text: e instanceof Error ? e.message : 'Kontrol başarısız' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <section className={section}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Users className="h-4 w-4 text-indigo-600" /> Kurgu ekibi
        </h3>
        <p className="text-xs text-slate-500">
          Seçilen kullanıcılar tüm görevleri ve videoları görür, onaylar veya düzeltme ister. Görev oluşturamaz ve ayarları değiştiremez.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kullanıcı ara" className={`${field} pl-9`} />
        </div>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
          {filtered.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={editors.has(p.id)}
                onChange={(e) =>
                  patch({ editor_user_ids: e.target.checked ? [...s.editor_user_ids, p.id] : s.editor_user_ids.filter((x) => x !== p.id) })
                }
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{p.name}</span>
              <span className="text-[11px] text-slate-400">{p.role}</span>
            </label>
          ))}
        </div>
      </section>

      <section className={section}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <HardDrive className="h-4 w-4 text-indigo-600" /> Google Drive
        </h3>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Doğrudan yükleme: <b>{drive?.upload_effective ? 'etkin' : 'kapalı'}</b>
          {' · '}Hizmet hesabı anahtarı: <b>{drive?.credentials_configured ? 'tanımlı' : 'tanımlı değil'}</b>
          {!drive?.upload_effective ? ' · Öğretmenler Drive bağlantısı ekleyerek teslim eder.' : ''}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" className="h-4 w-4" checked={s.drive_upload_enabled} onChange={(e) => patch({ drive_upload_enabled: e.target.checked })} />
          Öğretmen videoyu görev ekranından doğrudan Drive’a yüklesin
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Paylaşılan Drive kimliği</span>
            <input value={s.drive_shared_drive_id || ''} onChange={(e) => patch({ drive_shared_drive_id: e.target.value.trim() })} className={field} placeholder="0AB…" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Hedef klasör kimliği</span>
            <input value={s.drive_folder_id || ''} onChange={(e) => patch({ drive_folder_id: e.target.value.trim() })} className={field} placeholder="1xY…" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Bağlantı ile teslimde öğretmene gösterilecek klasör</span>
          <input value={s.link_folder_url || ''} onChange={(e) => patch({ link_folder_url: e.target.value })} className={field} placeholder="https://drive.google.com/drive/folders/…" inputMode="url" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runCheck()} disabled={checking} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Drive bağlantısını test et
          </button>
          {check ? (
            <span className={`inline-flex items-center gap-1 text-xs ${check.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
              {check.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {check.text}
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-slate-500">Test, kaydedilmiş ayarlarla yapılır. Dosyalar herkese açık paylaşılmaz.</p>
      </section>

      <section className={section}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Bell className="h-4 w-4 text-indigo-600" /> Günlük özet
        </h3>
        <p className="text-xs text-slate-500">
          Kanal: panel içi bildirim (zil) + bildirim izni verilmiş cihazlarda anlık bildirim. Alıcılar: kurum yöneticileri ve kurgu ekibi.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" className="h-4 w-4" checked={s.daily_summary_enabled} onChange={(e) => patch({ daily_summary_enabled: e.target.checked })} />
          Günlük özet gönder
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Saat (Türkiye)</span>
            <input type="time" value={s.daily_summary_time} onChange={(e) => patch({ daily_summary_time: e.target.value })} className={`${field} w-32`} />
          </label>
          <div className="flex flex-wrap gap-1">
            {GUN.map((g, i) => {
              const n = i + 1;
              const on = s.daily_summary_days.includes(n);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => patch({ daily_summary_days: on ? s.daily_summary_days.filter((x) => x !== n) : [...s.daily_summary_days, n].sort() })}
                  className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet
        </button>
      </div>
    </div>
  );
}
