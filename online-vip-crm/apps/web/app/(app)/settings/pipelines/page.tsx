import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Pipeline ayarları' };

export default function SettingsPipelinesPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Pipeline ayarları" description="Aşamalar ve otomasyon kuralları" />
    </div>
  );
}
