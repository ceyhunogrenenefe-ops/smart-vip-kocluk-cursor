import { prisma, type Provider } from '@online-vip-crm/database';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from './config';
import { writeDeadLetter } from './dead-letter';
import { processEmailSync } from './processors/email-sync';
import { processNotification } from './processors/notifications';
import { processOutboundMessage } from './processors/outbound-messages';
import { processWebhookEvent } from './processors/webhook-events';
import { ALL_QUEUE_NAMES, QUEUE_NAMES, defaultJobOptions } from './queues';
import type {
  EmailSyncJobData,
  NotificationJobData,
  OutboundMessageJobData,
  WebhookEventJobData,
} from './types';

const PROVIDERS = new Set<string>([
  'WHATSAPP',
  'INSTAGRAM',
  'FACEBOOK',
  'EMAIL',
  'WEBSITE',
  'PHONE',
  'MOCK',
]);

function asProvider(value: unknown): Provider | null {
  return typeof value === 'string' && PROVIDERS.has(value) ? (value as Provider) : null;
}

const config = loadConfig();

function createConnection(): IORedis {
  const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  connection.on('error', (err) => {
    console.error('[worker] redis error', err.message);
  });
  return connection;
}

function connectionOpts(redis: IORedis): ConnectionOptions {
  return redis as unknown as ConnectionOptions;
}

function extractInstitutionId(data: unknown): string | null {
  if (data && typeof data === 'object' && 'institutionId' in data) {
    const value = (data as { institutionId?: unknown }).institutionId;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function sourceIdForJob(queueName: string, data: Record<string, unknown>, jobId?: string): string {
  switch (queueName) {
    case QUEUE_NAMES.WEBHOOK_EVENTS:
      return String(data.webhookEventId ?? jobId ?? 'unknown');
    case QUEUE_NAMES.OUTBOUND_MESSAGES:
      return String(data.messageId ?? jobId ?? 'unknown');
    case QUEUE_NAMES.EMAIL_SYNC:
      return String(data.channelConnectionId ?? jobId ?? 'unknown');
    case QUEUE_NAMES.NOTIFICATIONS:
      return String(data.notificationId ?? data.userId ?? jobId ?? 'unknown');
    default:
      return String(jobId ?? 'unknown');
  }
}

async function handleFailedJob(queueName: string, job: Job | undefined, err: Error): Promise<void> {
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? config.WORKER_MAX_ATTEMPTS;
  const exhausted = job.attemptsMade >= maxAttempts;
  if (!exhausted) {
    console.warn(
      `[${queueName}] job ${job.id} failed attempt ${job.attemptsMade}/${maxAttempts}: ${err.message}`,
    );
    return;
  }

  const data = (job.data ?? {}) as Record<string, unknown>;
  const institutionId = extractInstitutionId(data);
  const provider = asProvider(data.provider);

  console.error(
    `[${queueName}] moving to dead letter job=${job.id} institution=${institutionId ?? 'null'}: ${err.message}`,
  );

  try {
    await writeDeadLetter(prisma, {
      institutionId,
      provider,
      sourceTable:
        queueName === QUEUE_NAMES.WEBHOOK_EVENTS
          ? 'webhook_events'
          : queueName === QUEUE_NAMES.OUTBOUND_MESSAGES
            ? 'messages'
            : queueName === QUEUE_NAMES.EMAIL_SYNC
              ? 'channel_connections'
              : 'notifications',
      sourceId: sourceIdForJob(queueName, data, job.id),
      payload: {
        queue: queueName,
        jobId: job.id,
        jobName: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
      },
      lastError: err.message,
    });
  } catch (dlqError) {
    console.error(`[${queueName}] failed to write dead letter`, dlqError);
  }
}

async function processJob(queueName: string, job: Job): Promise<unknown> {
  switch (queueName) {
    case QUEUE_NAMES.WEBHOOK_EVENTS:
      return processWebhookEvent(prisma, job as Job<WebhookEventJobData>);
    case QUEUE_NAMES.OUTBOUND_MESSAGES:
      return processOutboundMessage(prisma, job as Job<OutboundMessageJobData>);
    case QUEUE_NAMES.EMAIL_SYNC:
      return processEmailSync(prisma, job as Job<EmailSyncJobData>);
    case QUEUE_NAMES.NOTIFICATIONS:
      return processNotification(prisma, job as Job<NotificationJobData>);
    default:
      throw new Error(`Unknown queue: ${queueName}`);
  }
}

function startWorkers(redis: IORedis): Worker[] {
  const workers: Worker[] = [];

  for (const queueName of ALL_QUEUE_NAMES) {
    const worker = new Worker(
      queueName,
      async (job) => processJob(queueName, job),
      {
        connection: connectionOpts(redis),
        concurrency: config.WORKER_CONCURRENCY,
        ...({} as object),
      },
    );

    // Ensure default job options are documented for producers; workers honor job.opts.
    void defaultJobOptions(config.WORKER_MAX_ATTEMPTS);

    worker.on('completed', (job) => {
      console.info(`[${queueName}] completed job=${job.id}`);
    });

    worker.on('failed', (job, err) => {
      void handleFailedJob(queueName, job, err);
    });

    workers.push(worker);
    console.info(`[worker] listening on queue=${queueName} concurrency=${config.WORKER_CONCURRENCY}`);
  }

  return workers;
}

async function main(): Promise<void> {
  console.info(
    `[worker] starting env=${config.NODE_ENV} redis=${config.REDIS_URL.replace(/\/\/.*@/, '//***@')}`,
  );

  const redis = createConnection();
  const workers = startWorkers(redis);

  const shutdown = async (signal: string) => {
    console.info(`[worker] shutting down (${signal})...`);
    await Promise.all(workers.map((w) => w.close()));
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (err) => {
  console.error('[worker] fatal', err);
  await prisma.$disconnect();
  process.exit(1);
});
