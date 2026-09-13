import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Şablonlar' };

export default function SettingsTemplatesPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Şablonlar" description="Mesaj ve yanıt şablonları" />
    </div>
  );
}
