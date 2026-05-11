import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

const chip =
  'inline-flex items-center rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-100 dark:hover:bg-indigo-950/50';

/**
 * Haftalık planda: Akademik Merkez bölümlerine hızlı geçiş (etüt, deneme, soru havuzu).
 * Erişim kodları ayrı kartta; bu şerit sadece yönlendirme.
 */
export function AcademicCenterQuickLinks() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-violet-50/80 px-3 py-2.5 dark:border-indigo-500/30 dark:from-indigo-950/50 dark:to-violet-950/40">
      <div className="flex items-center gap-1.5 text-indigo-900 dark:text-indigo-100">
        <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
        <span className="text-sm font-semibold">Akademik merkez</span>
      </div>
      <Link to="/academic-center?tab=study" className={chip}>
        Etüt sınıfları
      </Link>
      <Link to="/academic-center?tab=exam" className={chip}>
        Deneme / optik
      </Link>
      <Link to="/academic-center?tab=pool" className={chip}>
        Soru havuzları
      </Link>
      <Link
        to="/academic-center"
        className="ml-auto inline-flex items-center text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
      >
        Tümü →
      </Link>
    </div>
  );
}
