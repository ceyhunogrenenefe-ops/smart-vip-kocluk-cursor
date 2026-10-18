import type { PrismaClient } from '@online-vip-crm/database';
import type { Job } from 'bullmq';
import type { EmailSyncJobData } from '../types';

/**
 * Mock IMAP/Gmail sync tick — logs connection and returns idle success.
 */
export async function processEmailSync(
  prisma: PrismaClient,
  job: Job<EmailSyncJobData>,
): Promise<{ channelConnectionId: string; status: string }> {
  const { channelConnectionId, institutionId } = job.data;

  if (!institutionId) {
    throw new Error('email-sync job requires institutionId');
  }
  if (!channelConnectionId) {
    throw new Error('email-sync job missing channelConnectionId');
  }

  const connection = await prisma.channelConnection.findFirst({
    where: { id: channelConnectionId, institutionId },
    select: { id: true, provider: true, status: true, displayName: true },
  });

  if (!connection) {
    throw new Error(
      `ChannelConnection ${channelConnectionId} not found for institution ${institutionId}`,
    );
  }

  console.info(
    `[email-sync] mock sync connection=${connection.id} provider=${connection.provider} name=${connection.displayName ?? '-'} attempt=${job.attemptsMade + 1}`,
  );

  return { channelConnectionId: connection.id, status: 'MOCK_SYNCED' };
}
