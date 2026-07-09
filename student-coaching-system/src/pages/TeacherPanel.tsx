import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import { Users, Radio, CheckCircle2, Presentation } from 'lucide-react';

type ScopeStudent = {
  id: string;
  name?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function studentDisplayName(s: ScopeStudent): string {
  const direct = String(s.name || '').trim();
  if (direct) return direct;
  return [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || s.id;
}

export default function TeacherPanel() {
  const navigate = useNavigate();
  const { students: contextStudents } = useApp();
  const [scopedStudents, setScopedStudents] = useState<ScopeStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/api/teacher-scope');
        const j = (await res.json().catch(() => ({}))) as {
          data?: { students?: ScopeStudent[] };
          error?: string;
        };
        if (!res.ok) throw new Error(String(j.error || 'Öğretmen kapsamı alınamadı'));
        if (!cancelled) {
          setScopedStudents(Array.isArray(j.data?.students) ? j.data!.students! : []);
        }
      } catch {
        if (!cancelled) {
          setScopedStudents(
            (contextStudents || []).map((s) => ({
              id: s.id,
              name: s.name,
              email: s.email
            }))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextStudents]);

  const myStudents = useMemo(() => scopedStudents, [scopedStudents]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">Öğretmen Paneli</h1>
        <p className="text-violet-100 text-sm mt-1">
          Atandığınız grup sınıflarındaki ve özel ders öğrencilerinizi görüntüleyin; canlı özel ders oluşturun ve
          dersi tamamlandı olarak işaretleyin.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-violet-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-sm">Öğrencilerim</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{loading ? '…' : myStudents.length}</p>
        </div>
        <button
          onClick={() => navigate('/live-lessons')}
          className="bg-white border border-slate-100 rounded-xl p-4 text-left hover:bg-slate-50"
        >
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Radio className="w-4 h-4" />
            <span className="text-sm">Canlı özel ders</span>
          </div>
          <p className="text-slate-700 text-sm">Ders oluştur / haftalık plan / tekrar / çakışma kontrolü</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/edu-panel')}
          className="bg-white border border-slate-100 rounded-xl p-4 text-left hover:bg-slate-50"
        >
          <div className="flex items-center gap-2 text-violet-600 mb-1">
            <Presentation className="w-4 h-4" />
            <span className="text-sm">Ders içerik paneli</span>
          </div>
          <p className="text-slate-700 text-sm">HTML animasyon, ödev ve sınıf ders satırları</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/teacher-solution-appointments')}
          className="bg-white border border-slate-100 rounded-xl p-4 text-left hover:bg-slate-50"
        >
          <div className="flex items-center gap-2 text-teal-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Bugünkü Randevular</span>
          </div>
          <p className="text-slate-700 text-sm">Soru çözümü randevularını görüntüle ve oturum başlat</p>
        </button>
        <button
          onClick={() => navigate('/live-lessons')}
          className="bg-white border border-slate-100 rounded-xl p-4 text-left hover:bg-slate-50"
        >
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Ders tamamlandı</span>
          </div>
          <p className="text-slate-700 text-sm">Liste üzerinden canlı özel dersleri tamamlandı olarak işaretleyin</p>
        </button>
      </div>

      <div className="bg-white border border-slate-100 rounded-xl p-4">
        <h2 className="font-semibold text-slate-800 mb-3">Öğrencilerim</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : myStudents.length === 0 ? (
          <p className="text-sm text-slate-500">
            Henüz size atanmış öğrenci yok. Yöneticiniz sizi bir grup sınıfına öğretmen olarak ekleyebilir veya
            özel ders öğrencisi olarak atayabilir.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {myStudents.map((s) => (
              <div key={s.id} className="border border-slate-100 rounded-lg px-3 py-2">
                <p className="text-sm font-medium text-slate-800">{studentDisplayName(s)}</p>
                <p className="text-xs text-slate-500">{s.email || '-'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
