/**
 * Воркер очереди. Один процесс, одна очередь, разные имена задач.
 * Брокер bunqueue живёт отдельным процессом — его не перезапускает релиз приложения.
 */
import { createLogger } from '@workspace/log';
import type { IncomingMessage, JobName } from '@workspace/types';
import { Worker } from 'bunqueue/client';

import { config, setupLogging } from './env';
import { ingestMessages } from './ingest';
import { proposeFor } from './onboarding';
import { provisionCompanyDatabase } from './provision';

setupLogging();
const log = createLogger('worker');

const handlers: Record<JobName, (data: never) => Promise<unknown>> = {
  'onboarding:proposal': (data) => proposeFor(data as { userId: string; business: string }),
  'msg:ingest': (data) => {
    const job = data as { companyId: string; messages: readonly IncomingMessage[] };
    return ingestMessages(job.companyId, job.messages);
  },
  'db:provision': (data) => provisionCompanyDatabase(data as { companyId: string }),
};

const nameOf = (value: unknown): JobName | undefined => {
  if (value !== 'onboarding:proposal' && value !== 'msg:ingest' && value !== 'db:provision') return;
  return value;
};

const worker = new Worker(
  'ss',
  (job) => {
    const name = nameOf(job.name);
    if (name === undefined) return Promise.resolve({ skipped: job.name });
    return handlers[name](job.data as never);
  },
  { connection: { host: config.brokerHost, port: config.brokerPort }, concurrency: 4 },
);

worker.on('completed', (job) => log.info('задача выполнена', { job: job.name, id: job.id }));
worker.on('failed', (job, error) =>
  log.error('задача не выполнена', { job: job.name, id: job.id, error: String(error) }),
);

log.info('жду задачи', { queue: 'ss', broker: `${config.brokerHost}:${config.brokerPort}` });
