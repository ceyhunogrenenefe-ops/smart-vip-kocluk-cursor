import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Denetim kayıtları' };

export default function SettingsAuditLogsPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Denetim kayıtları" description="Sistem aktivite günlüğü" />
    </div>
  );
}
