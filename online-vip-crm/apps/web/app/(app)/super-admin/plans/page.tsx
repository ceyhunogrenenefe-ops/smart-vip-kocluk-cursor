import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SuperAdminNav } from '@/components/super-admin-nav';

export const metadata: Metadata = { title: 'Planlar' };

export default function SuperAdminPlansPage() {
  return (
    <div>
      <SuperAdminNav />
      <StubPage title="Planlar" description="Abonelik planları ve limitler" />
    </div>
  );
}
