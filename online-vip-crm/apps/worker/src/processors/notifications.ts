import type { PrismaClient } from '@online-vip-crm/database';
import type { Job } from 'bullmq';
import type { NotificationJobData } from '../types';

/**
 * Mock notification delivery: upserts a Notification row when notificationId absent.
 */
export async function processNotification(
  prisma: PrismaClient,
  job: Job<NotificationJobData>,
): Promise<{ notificationId: string; status: string }> {
  const { institutionId, userId, type, title, body, linkUrl, metadata, notificationId } =
    job.data;

  if (!institutionId) {
    throw new Error('notifications job requires institutionId');
  }
  if (!userId) {
    throw new Error('notifications job missing userId');
  }

  const membership = await prisma.userInstitution.findFirst({
    where: { userId, institutionId },
    select: { id: true },
  });

  if (!membership) {
    throw new Error(`User ${userId} is not a member of institution ${institutionId}`);
  }

  if (notificationId) {
    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, institutionId },
    });
    if (!existing) {
      throw new Error(`Notification ${notificationId} not found for institution ${institutionId}`);
    }
    console.info(
      `[notifications] mock deliver existing id=${existing.id} user=${userId} type=${existing.type}`,
    );
    return { notificationId: existing.id, status: 'MOCK_DELIVERED' };
  }

  const created = await prisma.notification.create({
    data: {
      institutionId,
      userId,
      type,
      title,
      body: body ?? null,
      linkUrl: linkUrl ?? null,
      metadata: (metadata ?? {}) as object,
    },
  });

  console.info(
    `[notifications] created+mock-deliver id=${created.id} user=${userId} type=${type}`,
  );
  return { notificationId: created.id, status: 'MOCK_CREATED' };
}
