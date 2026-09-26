import type { PrismaClient, Provider } from '@online-vip-crm/database';
import { ProcessingStatus } from '@online-vip-crm/database';

export interface DeadLetterInput {
  institutionId: string | null;
  provider?: Provider | null;
  sourceTable: string;
  sourceId: string;
  payload: unknown;
  lastError: string;
}

/**
 * Persist a failed job to `dead_letter_events` and mark related webhook rows.
 * Always scopes writes by institutionId when present.
 */
export async function writeDeadLetter(
  prisma: PrismaClient,
  input: DeadLetterInput,
): Promise<void> {
  await prisma.deadLetterEvent.create({
    data: {
      institutionId: input.institutionId,
      provider: input.provider ?? null,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      payload: (input.payload ?? {}) as object,
      lastError: input.lastError.slice(0, 4_000),
    },
  });

  if (input.sourceTable === 'webhook_events') {
    await prisma.webhookEvent.updateMany({
      where: {
        id: input.sourceId,
        ...(input.institutionId ? { institutionId: input.institutionId } : {}),
      },
      data: {
        processingStatus: ProcessingStatus.DEAD_LETTER,
        lastError: input.lastError.slice(0, 4_000),
      },
    });
  }
}
