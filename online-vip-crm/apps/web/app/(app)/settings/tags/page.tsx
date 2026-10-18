import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Etiketler' };

export default function SettingsTagsPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Etiketler" description="Kişi ve konuşma etiketleri" />
    </div>
  );
}
