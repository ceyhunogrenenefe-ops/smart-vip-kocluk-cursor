import React from 'react';
import LiveLessons from '../LiveLessons';

/** Takvim odaklı görünüm — aynı LiveLessons motoru (haftalık grid). */
export default function PrivateLiveCalendarPage() {
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
