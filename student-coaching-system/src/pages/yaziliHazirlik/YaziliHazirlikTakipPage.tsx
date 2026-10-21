import React from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/rolePermissions';
import YaziliHazirlikTakip from './YaziliHazirlikTakip';

/** Menüden doğrudan açılan yönetici sayfası: yazılıya hazırlık öğretmen takibi. */
export default function YaziliHazirlikTakipPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#173b70] to-indigo-700 p-6 text-white">
        <div>
          <h1 className="text-2xl font-bold">Yazılı Hazırlık Takibi</h1>
          <p className="mt-1 max-w-2xl text-sm text-indigo-100">
            Hangi öğretmen hangi yazılıya kaç çalışma yükledi. Satıra tıklayınca yüklediği dosyalar açılır.
          </p>
        </div>
        <Link
          to="/yazili-hazirlik"
          className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
        >
          <FileText className="h-4 w-4" /> Çalışma raflarına git
        </Link>
      </div>
      <YaziliHazirlikTakip superAdmin={userHasAnyRole(user, ['super_admin'])} />
    </div>
  );
}
