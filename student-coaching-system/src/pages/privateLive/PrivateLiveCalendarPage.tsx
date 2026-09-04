import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import LiveLessons from '../LiveLessons';

/** Personel takvim grid'i. Öğrenci takvimi Özet sayfasının altında — eski /takvim linki Özet'e yönlenir. */
export default function PrivateLiveCalendarPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isStudent =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));

  if (isStudent) {
    return <Navigate to="/canli-ozel-ders" replace />;
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
