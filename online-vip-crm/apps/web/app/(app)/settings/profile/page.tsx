import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Profil' };

export default function SettingsProfilePage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Profil" description="Hesap bilgileriniz ve tercihler" />
    </div>
  );
}
