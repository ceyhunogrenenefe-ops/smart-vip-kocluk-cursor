import type { Metadata } from 'next';
import { StubPage } from '@/components/ui/page';
import { SettingsNav } from '@/components/settings-nav';

export const metadata: Metadata = { title: 'Kullanıcılar' };

export default function SettingsUsersPage() {
  return (
    <div>
      <SettingsNav />
      <StubPage title="Kullanıcılar" description="Kurum kullanıcıları ve davetler" />
    </div>
  );
}
