import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  fetchEduTeacherStudents,
  type EduTeacherStudentOption
} from '../../lib/eduPanel/eduPanelApi';
import type { EduHomeworkDraft } from '../../lib/eduPanel/eduHomeworkForm';

type Props = {
  lessonRowId: string;
  draft: EduHomeworkDraft;
  disabled?: boolean;
  onChange: (patch: Partial<EduHomeworkDraft>) => void;
};

export default function EduHomeworkAssigneePicker({
  lessonRowId,
  draft,
  disabled,
  onChange
}: Props) {
  const [students, setStudents] = useState<EduTeacherStudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void fetchEduTeacherStudents(lessonRowId)
      .then((rows) => {
        if (!cancel) setStudents(rows);
      })
      .catch(() => {
        if (!cancel) setStudents([]);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [lessonRowId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    if (!needle) return students;
    return students.filter((s) => String(s.name || '').toLocaleLowerCase('tr').includes(needle));
  }, [students, q]);

  const toggleStudent = (id: string) => {
    const set = new Set(draft.assignee_student_ids || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ assignee_student_ids: [...set] });
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-3">
      <p className="text-xs font-semibold text-amber-900">Kime verilsin?</p>
      <div className="flex flex-col gap-1.5">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name={`assignee-${lessonRowId}`}
            checked={draft.assignee_mode !== 'students'}
            disabled={disabled}
            onChange={() => onChange({ assignee_mode: 'class', assignee_student_ids: [] })}
          />
          Sınıfa Ver
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name={`assignee-${lessonRowId}`}
            checked={draft.assignee_mode === 'students'}
            disabled={disabled}
            onChange={() => onChange({ assignee_mode: 'students' })}
          />
          Öğrenci Seç
        </label>
      </div>

      {draft.assignee_mode === 'students' ? (
        <div className="mt-2 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İsim ara…"
              disabled={disabled || loading}
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm"
            />
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
            {loading ? (
              <p className="text-xs text-slate-400">Yükleniyor…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-slate-400">Öğrenci bulunamadı</p>
            ) : (
              filtered.map((st) => {
                const checked = (draft.assignee_student_ids || []).includes(st.id);
                return (
                  <label
                    key={st.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-amber-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleStudent(st.id)}
                    />
                    <span className="truncate">{st.name}</span>
                  </label>
                );
              })
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            {(draft.assignee_student_ids || []).length} öğrenci seçildi
          </p>
        </div>
      ) : null}
    </div>
  );
}
