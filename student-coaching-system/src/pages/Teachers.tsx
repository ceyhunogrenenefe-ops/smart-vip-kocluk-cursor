import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { Edit2, Loader2, LogIn, Plus, Search, Trash2, UserCircle } from 'lucide-react';

import { useAuth, type SystemUser } from '../context/AuthContext';

import { apiFetch } from '../lib/session';

import { db } from '../lib/database';



type TeacherUser = {

  id: string;

  name: string;

  email: string;

  phone?: string | null;

  role?: string;

  roles?: string[];

};



function toSystemUser(u: TeacherUser): SystemUser {

  const roles = Array.isArray(u.roles)

    ? (u.roles.filter(Boolean) as SystemUser['roles'])

    : undefined;

  return {

    id: u.id,

    name: u.name || 'Öğretmen',

    email: u.email,

    phone: u.phone || undefined,

    role: 'teacher',

    roles: roles?.length ? roles : undefined,

    package: 'trial',

    isActive: true,

    startDate: new Date().toISOString(),

    endDate: new Date(Date.now() + 365 * 86400000).toISOString(),

    createdAt: new Date().toISOString()

  };

}



export default function Teachers() {

  const navigate = useNavigate();

  const { effectiveUser, impersonate, canImpersonate } = useAuth();

  const canManage =

    effectiveUser?.role === 'super_admin' || effectiveUser?.role === 'admin';



  const [rows, setRows] = useState<TeacherUser[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  const [loginBusyId, setLoginBusyId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);



  const loadTeachers = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const res = await apiFetch('/api/users');

      const j = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(String(j.error || 'Öğretmen listesi alınamadı'));

      const data = Array.isArray(j.data) ? j.data : [];

      const onlyTeachers = data.filter((u: TeacherUser) => {

        const role = String(u.role || '').toLowerCase();

        const roles = Array.isArray(u.roles)

          ? u.roles.map((x: unknown) => String(x || '').toLowerCase())

          : [];

        return role === 'teacher' || roles.includes('teacher');

      });

      setRows(onlyTeachers);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Öğretmenler yüklenemedi');

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    void loadTeachers();

  }, [loadTeachers, refreshKey]);



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



  const handleLoginAs = async (u: TeacherUser) => {

    const target = toSystemUser(u);

    if (target.email.toLowerCase().trim() === effectiveUser?.email?.toLowerCase().trim()) {

      alert('Zaten bu hesapla oturum açmış durumdasınız.');

      return;

    }

    if (!canImpersonate(target)) {

      alert('Bu öğretmen hesabına geçiş yetkiniz yok.');

      return;

    }

    setLoginBusyId(u.id);

    try {

      const r = await impersonate(target);

      if (!r.success) {

        alert(r.message);

        return;

      }

      navigate('/teacher-panel');

    } finally {

      setLoginBusyId(null);

    }

  };



  const handleEdit = (u: TeacherUser) => {

    navigate(`/user-management?kullanici_duzenle=${encodeURIComponent(u.id)}`);

  };



  const handleDelete = async (u: TeacherUser) => {

    if (!confirm(`"${u.name || u.email}" öğretmenini silmek istediğinizden emin misiniz?`)) return;

    try {

      await db.deleteUser(u.id);

      setRefreshKey((k) => k + 1);

    } catch (e) {

      alert(e instanceof Error ? e.message : 'Öğretmen silinemedi');

    }

  };



  return (

    <div className="space-y-6">

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        <div>

          <h2 className="text-2xl font-bold text-slate-800">Öğretmenler</h2>

          <p className="text-gray-500">Toplam {rows.length} öğretmen</p>

        </div>

        {canManage && (

          <button

            type="button"

            onClick={() => navigate('/user-management?ogretmen_ekle=1')}

            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"

          >

            <Plus className="w-5 h-5" />

            Yeni Öğretmen Ekle

          </button>

        )}

      </div>



      {error && (

        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>

      )}

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

            <div className="flex items-start justify-between gap-2">

              <div className="flex items-start gap-3 min-w-0">

                <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">

                  {String(u.name || 'Ö').charAt(0).toUpperCase()}

                </div>

                <div className="min-w-0">

                  <h3 className="font-semibold text-slate-800 truncate">{u.name || 'İsimsiz'}</h3>

                  <p className="text-sm text-gray-500 truncate">{u.email || '-'}</p>

                  <p className="text-xs text-gray-500 mt-1">{u.phone || 'Telefon yok'}</p>

                </div>

              </div>

              {canManage && (

                <div className="flex items-center gap-1 shrink-0">

                  <button

                    type="button"

                    title="Öğretmen hesabına gir"

                    disabled={loginBusyId === u.id}

                    onClick={() => void handleLoginAs(u)}

                    className="p-1.5 text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-50"

                  >

                    {loginBusyId === u.id ? (

                      <Loader2 className="w-4 h-4 animate-spin" />

                    ) : (

                      <LogIn className="w-4 h-4" />

                    )}

                  </button>

                  <button

                    type="button"

                    title="Düzenle"

                    onClick={() => handleEdit(u)}

                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"

                  >

                    <Edit2 className="w-4 h-4" />

                  </button>

                  <button

                    type="button"

                    title="Sil"

                    onClick={() => void handleDelete(u)}

                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"

                  >

                    <Trash2 className="w-4 h-4" />

                  </button>

                </div>

              )}

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


