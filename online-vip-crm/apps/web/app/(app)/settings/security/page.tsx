import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Güvenlik' };

export default function SettingsSecurityPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Güvenlik" description="Oturum, şifre ve güvenlik politikaları" />
    </div>
  );
}
