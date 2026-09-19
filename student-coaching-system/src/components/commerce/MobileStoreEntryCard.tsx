import { Link } from 'react-router-dom';
import { ChevronRight, ShoppingBag, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import { useMobileAppShell } from '../../hooks/useMobileAppShell';

/**
 * Mobil (native uygulama + dar ekran) öğrenci için Kitap Mağazası girişi.
 * Mobil kabukta yan menü gizli olduğundan mağazaya başka yol yoktu; alt sekmelere dokunmadan
 * Merkez ve Profil sayfalarına kart olarak eklenir. Masaüstünde ve personelde görünmez.
 */
export default function MobileStoreEntryCard({ className = '' }: { className?: string }) {
  const { effectiveUser } = useAuth();
  const mobileAppShell = useMobileAppShell();
  const tags = userRoleTags(effectiveUser);
  const studentOnly =
    tags.includes('student') && !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  if (!mobileAppShell || !studentOnly) return null;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm ${className}`}
    >
      <Link
        to="/kitap-magazasi"
        className="flex items-center gap-3 p-4 active:bg-amber-100/60 touch-manipulation"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow">
          <ShoppingBag className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-slate-900">Kitap Mağazası</span>
          <span className="block text-xs text-slate-600">Kitap ve setleri incele, sipariş ver</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-amber-700" />
      </Link>
      <Link
        to="/sepet"
        className="flex items-center gap-2 border-t border-amber-200/70 px-4 py-2.5 text-sm font-medium text-amber-900 active:bg-amber-100/60 touch-manipulation"
      >
        <ShoppingCart className="h-4 w-4" />
        Sepetim
      </Link>
    </div>
  );
}
