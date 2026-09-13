import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SuperAdminNav } from '@/components/super-admin-nav';

export const metadata: Metadata = { title: 'Entegrasyon hataları' };

export default function SuperAdminIntegrationErrorsPage() {
  return (
    <div>
      <SuperAdminNav />
      <StubPage title="Entegrasyon hataları" description="Webhook ve kanal hata kuyruğu" />
    </div>
  );
}
