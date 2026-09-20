import { Link } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';

/** Akademik Merkez girişi: Edesis hata karneleri (öğrenci kendi, koç öğrencisi, yönetici tümü). */
export default function AcademicHataKarnesiCard() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isStaff = tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  const canSee = isStaff || tags.includes('student');
  if (!canSee) return null;
  return (
    <Link
      to="/hata-karnesi"
      className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 p-4 shadow-sm transition hover:border-rose-300 hover:shadow active:bg-rose-100/60 touch-manipulation"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-orange-600 text-white shadow">
        <FileText className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-slate-900">
          {isStaff ? 'Hata Karneleri' : 'Hata Karnelerim'}
        </span>
        <span className="block text-xs text-slate-600">
          {isStaff
            ? 'Edesis’te oluşturulan karneler — öğrenci bazında PDF'
            : 'Denemelerdeki boş ve yanlış sorularından oluşan karnen'}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-rose-700" />
    </Link>
  );
}
