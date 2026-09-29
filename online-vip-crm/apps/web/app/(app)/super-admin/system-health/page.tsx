import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SuperAdminNav } from '@/components/super-admin-nav';

export const metadata: Metadata = { title: 'Sistem sağlığı' };

export default function SuperAdminSystemHealthPage() {
  return (
    <div>
      <SuperAdminNav />
      <StubPage title="Sistem sağlığı" description="Servis durumu ve sağlık kontrolleri" />
    </div>
  );
}
