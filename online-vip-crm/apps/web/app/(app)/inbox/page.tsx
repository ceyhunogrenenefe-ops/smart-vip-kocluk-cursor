import type { Metadata } from 'next';
import { InboxLayout } from '@/components/inbox/inbox-layout';

export const metadata: Metadata = {
  title: 'Gelen Kutusu',
};

export default function InboxPage() {
  return <InboxLayout />;
}
