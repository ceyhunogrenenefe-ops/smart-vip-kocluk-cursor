import React from 'react';
import { GraduationCap } from 'lucide-react';
import type { TrialFunnel } from '../../lib/coachStatsApi';

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

/** CRM pipeline "Deneme dersi" hunisi — sınıf bazında katılım ve kayda dönüş */
export default function TrialLessonFunnel({ data, from, to }: { data: TrialFunnel; from: string; to: string }) {
  const t = data.totals;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            Deneme dersi (CRM)
          </h2>
          <p className="text-xs text-slate-500">
            {from} → {to} arasında pipeline'da deneme dersi aşamasına alınan lead'ler. "Deneme dersi
            yapıldı"ya geçen katıldı, kesin kayda dönen kayıt oldu sayılır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-xl bg-slate-100 px-3 py-1.5 font-semibold text-slate-800">{t.planned} alındı</span>
          <span className="rounded-xl bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">
            {t.attended} katıldı · {fmtPct(t.attend_rate)}
          </span>
          <span className="rounded-xl bg-rose-50 px-3 py-1.5 font-semibold text-rose-800">{t.not_attended} katılmadı</span>
          <span className="rounded-xl bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-800">
            {t.registered} kayıt · {fmtPct(t.register_rate)}
          </span>
        </div>
      </div>
      {data.by_grade.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          Bu tarih aralığında CRM'de deneme dersi aşamasına alınan lead yok. Temsilciler pipeline'da
          lead'i "Deneme dersi planlandı / yapıldı" sütununa taşıdıkça burada sınıf sınıf görünür.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Sınıf</th>
                <th className="px-3 py-2.5">Deneme dersine alınan</th>
                <th className="px-3 py-2.5">Katılan</th>
                <th className="px-3 py-2.5">Katılmayan</th>
                <th className="px-3 py-2.5">Kayıt olan</th>
                <th className="px-3 py-2.5">Katılım %</th>
                <th className="px-3 py-2.5">Kayda dönüş %</th>
              </tr>
            </thead>
            <tbody>
              {data.by_grade.map((r) => (
                <tr key={r.grade} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{r.label}</td>
                  <td className="px-3 py-2">{r.planned}</td>
                  <td className="px-3 py-2 text-emerald-700">{r.attended}</td>
                  <td className="px-3 py-2 text-rose-700">{r.not_attended}</td>
                  <td className="px-3 py-2 font-semibold text-indigo-700">
                    {r.registered}
                    {r.registered_attended !== r.registered ? (
                      <span className="block text-[11px] font-normal text-slate-500">
                        {r.registered_attended} tanesi derse katılıp kaydoldu
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{fmtPct(r.attend_rate)}</td>
                  <td className="px-3 py-2">{fmtPct(r.register_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
