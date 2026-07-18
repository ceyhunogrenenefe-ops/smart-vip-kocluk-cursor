import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './session';
import { sortByFirstName } from './personNameSort';

export type StaffPerson = { id: string; name: string; email?: string | null };

/** Öğretmen kullanıcıları (/api/users) — AppContext'te teachers yok. */
export function useTeacherOptions() {
  const [teachers, setTeachers] = useState<StaffPerson[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/users');
      const j = (await res.json().catch(() => ({}))) as {
        data?: Array<{ id: string; name?: string; email?: string; role?: string; roles?: string[] }>;
      };
      const data = Array.isArray(j.data) ? j.data : [];
      const onlyTeachers = data.filter((u) => {
        const role = String(u.role || '').toLowerCase();
        const roles = Array.isArray(u.roles) ? u.roles.map((x) => String(x || '').toLowerCase()) : [];
        return role === 'teacher' || roles.includes('teacher');
      });
      setTeachers(
        sortByFirstName(
          onlyTeachers.map((u) => ({
            id: u.id,
            name: u.name || u.email || u.id,
            email: u.email
          })),
          (t) => t.name
        )
      );
    } catch {
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { teachers, loading, reload };
}
