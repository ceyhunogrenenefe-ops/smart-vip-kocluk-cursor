import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';

export const metadata: Metadata = { title: 'Takvim' };

export default function CalendarPage() {
  return (
    <StubPage
      title="Takvim"
      description="Görevler, randevular ve hatırlatmalar"
    />
  );
}
