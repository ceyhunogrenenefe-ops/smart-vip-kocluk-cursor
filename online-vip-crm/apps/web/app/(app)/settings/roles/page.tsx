import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Roller' };

export default function SettingsRolesPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Roller" description="Yetki ve rol tanımları" />
    </div>
  );
}
