import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Users, Radio, CheckCircle2 } from 'lucide-react';

export default function TeacherPanel() {
  const navigate = useNavigate();
  const { students } = useApp();

  const myStudents = useMemo(() => students || [], [students]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">Öğretmen Paneli</h1>
        <p className="text-violet-100 text-sm mt-1">
          Kendi öğrencilerinizi görüntüleyin, canlı özel ders oluşturun ve dersi tamamlandı olarak işaretleyin.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-violet-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-sm">Öğrencilerim</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{myStudents.length}</p>
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
        <h2 className="font-semibold text-slate-800 mb-3">Kendi öğrencileriniz</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {myStudents.map((s) => (
            <div key={s.id} className="border border-slate-100 rounded-lg px-3 py-2">
              <p className="text-sm font-medium text-slate-800">{s.name}</p>
              <p className="text-xs text-slate-500">{s.email || '-'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
