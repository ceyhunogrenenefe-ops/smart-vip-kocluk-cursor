import type { Metadata } from 'next';
import { ConversationView } from '@/components/inbox/conversation-view';

export const metadata: Metadata = {
  title: 'Konuşma',
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <ConversationView conversationId={conversationId} />;
}
