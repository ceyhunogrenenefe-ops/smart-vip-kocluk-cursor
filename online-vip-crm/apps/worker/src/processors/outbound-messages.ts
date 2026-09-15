import type { PrismaClient } from '@online-vip-crm/database';
import type { Job } from 'bullmq';
import type { OutboundMessageJobData } from '../types';

/**
 * Mock outbound send: logs and no-ops. Real Meta/email providers wire in later.
 */
export async function processOutboundMessage(
  prisma: PrismaClient,
  job: Job<OutboundMessageJobData>,
): Promise<{ messageId: string; status: string }> {
  const { messageId, institutionId, provider } = job.data;

  if (!institutionId) {
    throw new Error('outbound-messages job requires institutionId');
  }
  if (!messageId) {
    throw new Error('outbound-messages job missing messageId');
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, institutionId },
    select: { id: true, status: true, provider: true, conversationId: true },
  });

  if (!message) {
    throw new Error(`Message ${messageId} not found for institution ${institutionId}`);
  }

  console.info(
    `[outbound-messages] mock send message=${message.id} provider=${provider ?? message.provider} conversation=${message.conversationId} attempt=${job.attemptsMade + 1}`,
  );

  return { messageId: message.id, status: 'MOCK_QUEUED' };
}
