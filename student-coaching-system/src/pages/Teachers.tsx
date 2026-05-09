import React, { useEffect, useMemo, useState } from 'react';
import { Search, UserCircle } from 'lucide-react';
import { apiFetch } from '../lib/session';

type TeacherUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: string;
  roles?: string[];
};

export default function Teachers() {
  const [rows, setRows] = useState<TeacherUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/api/users');
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(j.error || 'Öğretmen listesi alınamadı'));
        const data = Array.isArray(j.data) ? j.data : [];
        const onlyTeachers = data.filter((u) => {
          const role = String(u.role || '').toLowerCase();
          const roles = Array.isArray(u.roles) ? u.roles.map((x: unknown) => String(x || '').toLowerCase()) : [];
          return role === 'teacher' || roles.includes('teacher');
        });
        if (!cancelled) setRows(onlyTeachers);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Öğretmenler yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      return (
        String(u.name || '').toLowerCase().includes(q) ||
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.phone || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Öğretmenler</h2>
        <p className="text-gray-500">Toplam {rows.length} öğretmen</p>
      </div>

      {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-slate-500">Yükleniyor...</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Öğretmen ara (isim, e-posta, telefon)"
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((u) => (
          <div key={u.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                {String(u.name || 'Ö').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800 truncate">{u.name || 'İsimsiz'}</h3>
                <p className="text-sm text-gray-500 truncate">{u.email || '-'}</p>
                <p className="text-xs text-gray-500 mt-1">{u.phone || 'Telefon yok'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <UserCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Öğretmen bulunamadı</h3>
          <p className="text-gray-500">Filtreyi temizleyip tekrar deneyin.</p>
        </div>
      )}
    </div>
  );
}
