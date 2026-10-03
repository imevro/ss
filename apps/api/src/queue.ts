/**
 * Постановка задач в очередь. Ставит их тот, кто принял запрос: API.
 * Имена и вход задач — из @workspace/types, одно место на всех.
 */
import { createLogger } from '@workspace/log';
import type { JobName, Jobs } from '@workspace/types';
import { Queue } from 'bunqueue/client';

const log = createLogger('queue');

/**
 * Настройка с запасным значением. Запасной путь тут уместен: адрес брокера —
 * значение по умолчанию для местной машины, а не спрятанная ошибка.
 */
const orDefault = (value: string | undefined, fallback: string): string => {
  if (value === undefined || value === '') return fallback;
  return value;
};

const queue = new Queue('ss', {
  connection: {
    host: orDefault(process.env.BUNQUEUE_HOST, '127.0.0.1'),
    port: Number(orDefault(process.env.BUNQUEUE_PORT, '6789')),
  },
});

/** Положить работу в очередь. Возвращает ключ задачи для отслеживания. */
export const enqueue = async <N extends JobName>(name: N, data: Jobs[N]): Promise<string> => {
  const job = await queue.add(name, data);
  log.info('задача поставлена', { job: name, id: job.id });
  return job.id;
};
