import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';

export const metadata: Metadata = { title: 'Pipeline' };

export default function PipelinesPage() {
  return (
    <StubPage
      title="Pipeline"
      description="Satış ve kayıt pipeline görünümü"
    />
  );
}
