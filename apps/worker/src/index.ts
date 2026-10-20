/**
 * Воркер очереди. Один процесс, одна очередь, разные имена задач.
 * Брокер bunqueue живёт отдельным процессом — его не перезапускает релиз приложения.
 */
import { createLogger, setupLogging } from '@workspace/log';
import type { JobName, Jobs } from '@workspace/types';
import { Worker } from 'bunqueue/client';

import { config } from './env';
import { provisionCompanyDatabase } from './provision';

setupLogging();
const log = createLogger('worker');

/**
 * Данные задачи приходят из очереди непрозрачными: вид их задаёт имя, под которым
 * задача поставлена. Приведение одно на весь воркер — здесь.
 */
const jobOf = <N extends JobName>(name: N, data: unknown): Jobs[N] => data as Jobs[N];

const handlers: { readonly [N in JobName]: (data: unknown) => Promise<unknown> } = {
  'db:provision': (data) => provisionCompanyDatabase(jobOf('db:provision', data)),
};

/** Имя задачи: список имён один — ключи обработчиков. */
const nameOf = (value: unknown): JobName | undefined => {
  if (typeof value !== 'string') return;
  if (!Object.hasOwn(handlers, value)) return;
  return value as JobName;
};

const runJob = (name: JobName, data: unknown): Promise<unknown> => handlers[name](data);

const worker = new Worker(
  'ss',
  (job) => {
    const name = nameOf(job.name);
    if (name === undefined) return Promise.resolve({ skipped: job.name });
    return runJob(name, job.data);
  },
  { connection: { host: config.brokerHost, port: config.brokerPort }, concurrency: 4 },
);

worker.on('completed', (job) => log.info('задача выполнена', { job: job.name, id: job.id }));
worker.on('failed', (job, error) =>
  log.error('задача не выполнена', { job: job.name, id: job.id, error: String(error) }),
);

log.info('жду задачи', { queue: 'ss', broker: `${config.brokerHost}:${config.brokerPort}` });
