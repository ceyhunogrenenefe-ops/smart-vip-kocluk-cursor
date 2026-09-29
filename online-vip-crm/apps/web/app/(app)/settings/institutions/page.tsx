import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Kurumlar' };

export default function SettingsInstitutionsPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Kurumlar" description="Kurum profili ve abonelik" />
    </div>
  );
}
