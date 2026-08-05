import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './session';
import { sortByFirstName } from './personNameSort';

export type StaffPerson = { id: string; name: string; email?: string | null };

function isPrivateLessonStaff(u: {
  role?: string;
  roles?: string[];
}): boolean {
  const role = String(u.role || '').toLowerCase();
  const roles = Array.isArray(u.roles) ? u.roles.map((x) => String(x || '').toLowerCase()) : [];
  const allowed = ['teacher', 'coach', 'admin', 'super_admin'];
  return allowed.includes(role) || roles.some((r) => allowed.includes(r));
}

/** Canlı özel ders öğretmeni seçimi — öğretmen + koç + yönetici (users.id). */
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
      const staff = data.filter(isPrivateLessonStaff);
      setTeachers(
        sortByFirstName(
          staff.map((u) => ({
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
