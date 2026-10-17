import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SuperAdminNav } from '@/components/super-admin-nav';

export const metadata: Metadata = { title: 'Kurumlar' };

export default function SuperAdminInstitutionsPage() {
  return (
    <div>
      <SuperAdminNav />
      <StubPage title="Kurumlar" description="Tüm kurumların yönetimi" />
    </div>
  );
}
