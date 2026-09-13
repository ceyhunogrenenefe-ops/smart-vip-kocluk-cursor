import type { Metadata } from 'next';
import { MetricShell, PageHeader } from '@/components/ui/page';

export const metadata: Metadata = {
  title: 'Raporlar',
};

export default function ReportsPage() {
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Raporlar"
        description="Performans metrikleri ve dönemsel özetler"
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricShell label="Yanıt süresi" hint="Ort. ilk yanıt" />
        <MetricShell label="Dönüşüm oranı" hint="Lead → kayıt" />
        <MetricShell label="Kanal dağılımı" hint="WhatsApp / IG / diğer" />
        <MetricShell label="Görev tamamlanma" hint="Bu hafta" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Mesaj hacmi
          </p>
          <div className="mt-6 h-32 rounded-xl skeleton" />
        </div>
        <div className="h-56 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pipeline hunisi
          </p>
          <div className="mt-6 h-32 rounded-xl skeleton" />
        </div>
      </div>
    </div>
  );
}
