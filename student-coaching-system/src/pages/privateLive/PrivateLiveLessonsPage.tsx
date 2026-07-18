import React from 'react';
import LiveLessons from '../LiveLessons';

/** Liste + ders oluşturma; takvim ayrı «Takvim» sekmesinde. */
export default function PrivateLiveLessonsPage() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Ders oluşturma, BBB ve çakışma kontrolü burada. Haftalık görünüm için üstteki{' '}
        <strong>Takvim</strong> sekmesini kullanın.
      </p>
      <LiveLessons hideCalendar />
    </div>
  );
}
