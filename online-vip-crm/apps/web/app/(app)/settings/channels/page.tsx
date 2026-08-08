import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Kanallar' };

export default function SettingsChannelsPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Kanallar" description="WhatsApp, Instagram ve diğer kanal bağlantıları" />
    </div>
  );
}
