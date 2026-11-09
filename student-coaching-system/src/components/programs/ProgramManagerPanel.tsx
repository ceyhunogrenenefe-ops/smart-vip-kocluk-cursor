import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Layers, Loader2, Pencil, Plus, X } from 'lucide-react';
import { createEduProgram, updateEduProgram, type EduProgram, type ProgramClass } from '../../lib/eduPrograms';

type Props = {
  programs: EduProgram[];
  classes: ProgramClass[];
  institutionId: string;
  setupRequired?: boolean;
  onChanged: () => void | Promise<void>;
};

/** Yönetim: program ekle, adını değiştir, aktif/pasif yap. Silme yok (geçmiş gruplar korunur). */
export default function ProgramManagerPanel({ programs, classes, institutionId, setupRequired, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { groups: number; students: Set<string> }>();
    for (const c of classes) {
      if (!c.program_id) continue;
      const s = m.get(c.program_id) || { groups: 0, students: new Set<string>() };
      s.groups += 1;
      for (const sid of c.student_ids || []) s.students.add(sid);
      m.set(c.program_id, s);
    }
    return m;
  }, [classes]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await run('__new__', () => createEduProgram(name, institutionId || null))) setNewName('');
  };

  const saveName = async (p: EduProgram) => {
    const name = editName.trim();
    if (!name || name === p.name) {
      setEditId(null);
      return;
    }
    if (await run(p.id, () => updateEduProgram(p.id, { name }))) setEditId(null);
  };

  const activeCount = programs.filter((p) => p.is_active).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-violet-50/50 px-4 py-3 text-left sm:px-5"
      >
        <span className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-violet-600" aria-hidden />
          <span>
            <span className="block text-base font-bold text-slate-900">Programlar</span>
            <span className="block text-xs text-slate-500">
              {setupRequired
                ? 'Kurulum gerekli'
                : `${activeCount} aktif · ${programs.length - activeCount} pasif — Program → Sınıf seviyesi → Şube/Grup`}
            </span>
          </span>
        </span>
        {open ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
      </button>

      {open ? (
        <div className="space-y-3 border-t border-slate-100 p-4 sm:p-5">
          {setupRequired ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Programlar tablosu henüz kurulmamış. Supabase SQL Editor’de{' '}
              <code className="rounded bg-white px-1">sql/2026-11-09-edu-programs.sql</code> dosyasını bir kez çalıştırın.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {programs.map((p) => {
                  const st = stats.get(p.id);
                  const busy = busyId === p.id;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        {editId === p.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveName(p);
                                if (e.key === 'Escape') setEditId(null);
                              }}
                              className="w-full max-w-xs rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              title="Kaydet"
                              onClick={() => void saveName(p)}
                              className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Vazgeç"
                              onClick={() => setEditId(null)}
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <p className={`truncate text-sm font-semibold ${p.is_active ? 'text-slate-900' : 'text-slate-400'}`}>
                            {p.name}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500">
                          {st?.groups || 0} şube/grup · {st?.students.size || 0} öğrenci
                        </p>
                      </div>
                      {editId !== p.id ? (
                        <button
                          type="button"
                          title="Adı düzenle"
                          onClick={() => {
                            setEditId(p.id);
                            setEditName(p.name);
                          }}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={p.is_active}
                        disabled={busy}
                        onClick={() => void run(p.id, () => updateEduProgram(p.id, { is_active: !p.is_active }))}
                        className={`inline-flex min-w-[78px] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                          p.is_active
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        } disabled:opacity-50`}
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {p.is_active ? 'Aktif' : 'Pasif'}
                      </button>
                    </li>
                  );
                })}
                {programs.length === 0 ? (
                  <li className="px-3 py-4 text-center text-sm text-slate-500">Henüz program yok.</li>
                ) : null}
              </ul>
              <form onSubmit={(e) => void add(e)} className="flex flex-wrap gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Yeni program adı (ör. Ara Tatil Kampı)"
                  className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || busyId === '__new__'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {busyId === '__new__' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Program ekle
                </button>
              </form>
              <p className="text-[11px] text-slate-500">
                Pasif program yeni kayıt ve grup açma seçimlerinde görünmez; mevcut gruplar ve öğrenciler korunur.
              </p>
            </>
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
