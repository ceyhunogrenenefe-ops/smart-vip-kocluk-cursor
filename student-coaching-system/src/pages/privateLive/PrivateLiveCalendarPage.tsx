import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import LiveLessons from '../LiveLessons';
import StudentLiveLessonsPanel from '../../components/liveLessons/StudentLiveLessonsPanel';

/** Takvim odaklı görünüm — öğrenci için özel ders listesi + Katıl; personel için haftalık grid. */
export default function PrivateLiveCalendarPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isStudent =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));

  if (isStudent) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm text-sky-950">
          Planlı özel dersleriniz burada listelenir. <strong>Derse Katıl</strong> ders saatinden 2 saat
          önce aktif olur (BBB / Zoom / Meet).
        </div>
        <StudentLiveLessonsPanel />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950">
        Öğretmen yalnızca kendi öğrencilerini görür. Çakışan saatler sunucu tarafından engellenir (çift
        rezervasyon yok). BBB için ders saati yaklaşınca <strong>Katıl / Dersi Başlat</strong> aktif olur.
      </div>
      <LiveLessons />
    </div>
  );
}
