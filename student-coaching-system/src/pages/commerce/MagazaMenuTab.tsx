/**
 * Süper Admin — öğrenci mağazası sınıf + kategori kutuları
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { caGetSettings, caUpdateSettings } from '../../lib/commerceAdminApi';
import type { StoreBrowseCategory, StoreBrowseClass, StoreBrowseNav } from '../../types/commerce.types';

const EMPTY_NAV: StoreBrowseNav = { classes: [], categories: [] };

function slugish(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function MagazaMenuTab() {
  const [nav, setNav] = useState<StoreBrowseNav>(EMPTY_NAV);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newClassLabel, setNewClassLabel] = useState('');
  const [newCat, setNewCat] = useState({ label: '', series: '', description: '', class_keys: [] as string[] });

  const load = () => {
    setLoading(true);
    caGetSettings()
      .then((r) => {
        const browse = r.store_browse ?? EMPTY_NAV;
        setNav({
          classes: (browse.classes ?? []).map((c) => ({ ...c, active: c.active !== false })),
          categories: (browse.categories ?? []).map((c) => ({ ...c, active: c.active !== false, class_keys: c.class_keys ?? [] })),
        });
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // yalnızca ilk açılış
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedClasses = useMemo(
    () => [...nav.classes].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'tr')),
    [nav.classes]
  );
  const sortedCats = useMemo(
    () => [...nav.categories].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'tr')),
    [nav.categories]
  );

  const save = async (next: StoreBrowseNav) => {
    setSaving(true);
    try {
      const r = await caUpdateSettings({ store_browse: next });
      const browse = r.store_browse ?? next;
      setNav({
        classes: browse.classes ?? [],
        categories: browse.categories ?? [],
      });
      toast.success('Mağaza menüsü kaydedildi — öğrenci kutucukları güncellendi');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const patchClass = (key: string, patch: Partial<StoreBrowseClass>) => {
    setNav((prev) => ({
      ...prev,
      classes: prev.classes.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  };

  const patchCat = (key: string, patch: Partial<StoreBrowseCategory>) => {
    setNav((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  };

  const moveClass = (key: string, dir: -1 | 1) => {
    const list = [...sortedClasses];
    const i = list.findIndex((c) => c.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    setNav((prev) => ({
      ...prev,
      classes: prev.classes.map((c) => {
        if (c.key === a.key) return { ...c, sort: b.sort };
        if (c.key === b.key) return { ...c, sort: a.sort };
        return c;
      }),
    }));
  };

  const moveCat = (key: string, dir: -1 | 1) => {
    const list = [...sortedCats];
    const i = list.findIndex((c) => c.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    setNav((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => {
        if (c.key === a.key) return { ...c, sort: b.sort };
        if (c.key === b.key) return { ...c, sort: a.sort };
        return c;
      }),
    }));
  };

  const addClass = () => {
    const label = newClassLabel.trim();
    if (!label) { toast.error('Sınıf adı yazın'); return; }
    const keyGuess = /^\d{1,2}/.test(label) ? String(parseInt(label, 10)) : slugish(label).toUpperCase() || slugish(label);
    if (nav.classes.some((c) => c.key.toLocaleLowerCase('tr') === keyGuess.toLocaleLowerCase('tr'))) {
      toast.error('Bu sınıf zaten var');
      return;
    }
    const sort = (nav.classes.reduce((m, c) => Math.max(m, c.sort), 0) || 0) + 1;
    setNav((prev) => ({
      ...prev,
      classes: [...prev.classes, { key: keyGuess, label, sort, active: true }],
    }));
    setNewClassLabel('');
  };

  const addCategory = () => {
    const label = newCat.label.trim();
    if (!label) { toast.error('Kategori adı yazın'); return; }
    if (!newCat.class_keys.length) { toast.error('En az bir sınıf seçin'); return; }
    const key = slugish(newCat.series || label);
    if (!key) { toast.error('Kategori anahtarı oluşmadı'); return; }
    if (nav.categories.some((c) => c.key === key)) {
      toast.error('Bu kategori anahtarı zaten var');
      return;
    }
    const sort = (nav.categories.reduce((m, c) => Math.max(m, c.sort), 0) || 0) + 1;
    setNav((prev) => ({
      ...prev,
      categories: [...prev.categories, {
        key,
        label,
        series: slugish(newCat.series || key),
        description: newCat.description.trim(),
        class_keys: newCat.class_keys,
        sort,
        active: true,
      }],
    }));
    setNewCat({ label: '', series: '', description: '', class_keys: [] });
  };

  if (loading) {
    return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-indigo-400" /></div>;
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-indigo-600" />
            Mağaza menüsü
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Öğrenci önce <strong>Sınıflar</strong> kutularını görür. Her sınıfta aynı üç kutu açılır: <strong>Eğitim Setleri</strong>, <strong>Soru Bankaları</strong>, <strong>Denemeler</strong>. Kitabı düzenlerken bu kategorilerden biri seçilir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => save(nav)}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Kaydet
        </button>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Sınıflar</h3>
        <p className="text-xs text-gray-500 mb-4">Yan yana kutucuklar. Pasif olanlar öğrencide görünmez.</p>
        <div className="space-y-2">
          {sortedClasses.map((cl, idx) => (
            <div key={cl.key} className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-xl px-3 py-2 bg-slate-50/80">
              <div className="flex flex-col">
                <button type="button" className="text-gray-400 hover:text-indigo-600 disabled:opacity-30" disabled={idx === 0} onClick={() => moveClass(cl.key, -1)}><ChevronUp className="w-4 h-4" /></button>
                <button type="button" className="text-gray-400 hover:text-indigo-600 disabled:opacity-30" disabled={idx === sortedClasses.length - 1} onClick={() => moveClass(cl.key, 1)}><ChevronDown className="w-4 h-4" /></button>
              </div>
              <input
                className="border rounded-lg px-2 py-1.5 text-sm w-16 bg-white"
                value={cl.key}
                onChange={(e) => {
                  const nextKey = e.target.value.trim();
                  setNav((prev) => ({
                    classes: prev.classes.map((c) => (c.key === cl.key ? { ...c, key: nextKey } : c)),
                    categories: prev.categories.map((c) => ({
                      ...c,
                      class_keys: c.class_keys.map((k) => (k === cl.key ? nextKey : k)),
                    })),
                  }));
                }}
                title="Anahtar (8, LGS, TYT…)"
              />
              <input
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px] bg-white font-medium"
                value={cl.label}
                onChange={(e) => patchClass(cl.key, { label: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={cl.active !== false} onChange={(e) => patchClass(cl.key, { active: e.target.checked })} />
                Görünür
              </label>
              <button
                type="button"
                className="p-1.5 text-gray-400 hover:text-red-600"
                onClick={() => setNav((prev) => ({
                  ...prev,
                  classes: prev.classes.filter((c) => c.key !== cl.key),
                  categories: prev.categories.map((c) => ({ ...c, class_keys: c.class_keys.filter((k) => k !== cl.key) })),
                }))}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input
            className="border rounded-xl px-3 py-2 text-sm flex-1"
            placeholder="Yeni sınıf — örn. 8. Sınıf veya TYT"
            value={newClassLabel}
            onChange={(e) => setNewClassLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addClass(); }}
          />
          <button type="button" onClick={addClass} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100">
            <Plus className="w-4 h-4" /> Ekle
          </button>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Kitap kategorileri</h3>
        <p className="text-xs text-gray-500 mb-4">
          Standart üç kutu her sınıfta otomatik durur. Kitap düzenle → kategori: Eğitim Setleri / Soru Bankaları / Denemeler.
        </p>
        <div className="space-y-3">
          {sortedCats.map((cat, idx) => (
            <div key={cat.key} className="border border-gray-100 rounded-xl p-3 bg-slate-50/80">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" className="text-gray-400 hover:text-indigo-600 disabled:opacity-30" disabled={idx === 0} onClick={() => moveCat(cat.key, -1)}><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" className="text-gray-400 hover:text-indigo-600 disabled:opacity-30" disabled={idx === sortedCats.length - 1} onClick={() => moveCat(cat.key, 1)}><ChevronDown className="w-4 h-4" /></button>
                </div>
                <input
                  className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[160px] bg-white font-medium"
                  value={cat.label}
                  onChange={(e) => patchCat(cat.key, { label: e.target.value })}
                />
                <input
                  className="border rounded-lg px-2 py-1.5 text-sm w-44 bg-white font-mono text-xs"
                  value={cat.series}
                  onChange={(e) => patchCat(cat.key, { series: e.target.value.trim() })}
                  title="Kitap metadata.series"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={cat.active !== false} onChange={(e) => patchCat(cat.key, { active: e.target.checked })} />
                  Görünür
                </label>
                <button
                  type="button"
                  className="p-1.5 text-gray-400 hover:text-red-600"
                  onClick={() => setNav((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.key !== cat.key) }))}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                className="border rounded-lg px-2 py-1.5 text-sm w-full mt-2 bg-white"
                placeholder="Kısa açıklama (öğrenci kutusunda görünür)"
                value={cat.description}
                onChange={(e) => patchCat(cat.key, { description: e.target.value })}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sortedClasses.map((cl) => {
                  const on = cat.class_keys.includes(cl.key);
                  return (
                    <button
                      key={cl.key}
                      type="button"
                      onClick={() => patchCat(cat.key, {
                        class_keys: on ? cat.class_keys.filter((k) => k !== cl.key) : [...cat.class_keys, cl.key],
                      })}
                      className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-indigo-50'}`}
                    >
                      {cl.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4 space-y-2">
          <div className="text-sm font-medium text-gray-700">Yeni kategori</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Görünen ad — örn. Eğitim Setleri" value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} />
            <input className="border rounded-xl px-3 py-2 text-sm font-mono" placeholder="Anahtar — örn. egitim-setleri" value={newCat.series} onChange={(e) => setNewCat({ ...newCat, series: e.target.value })} />
          </div>
          <input className="border rounded-xl px-3 py-2 text-sm w-full" placeholder="Açıklama (opsiyonel)" value={newCat.description} onChange={(e) => setNewCat({ ...newCat, description: e.target.value })} />
          <div className="flex flex-wrap gap-1.5">
            {sortedClasses.map((cl) => {
              const on = newCat.class_keys.includes(cl.key);
              return (
                <button
                  key={cl.key}
                  type="button"
                  onClick={() => setNewCat({
                    ...newCat,
                    class_keys: on ? newCat.class_keys.filter((k) => k !== cl.key) : [...newCat.class_keys, cl.key],
                  })}
                  className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  {cl.label}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={addCategory} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100">
            <Plus className="w-4 h-4" /> Kategori ekle
          </button>
        </div>
      </section>
    </div>
  );
}
