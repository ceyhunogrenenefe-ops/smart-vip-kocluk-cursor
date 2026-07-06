import React from 'react';
import { Lock } from 'lucide-react';

interface CoachLessonsLockBannerProps {
  coachName?: string;
  forStudent?: boolean;
}

export function CoachLessonsLockBanner({ coachName, forStudent }: CoachLessonsLockBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold">Ders ve görüşmeler kilitli</p>
        <p className="mt-1 text-amber-900/90">
          {forStudent
            ? `Koçunuz${coachName ? ` (${coachName})` : ''} için ders ve online görüşme erişimi geçici olarak kapatılmıştır.`
            : 'Hesabınız için ders planlama ve online görüşme özelliği yönetici tarafından kilitlenmiştir.'}
        </p>
      </div>
    </div>
  );
}
