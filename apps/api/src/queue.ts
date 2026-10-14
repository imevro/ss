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

/**
 * Потолки работы по имени задачи. Их задаёт постановщик: задача без срока держит
 * воркер столько, сколько захочет та сторона, к которой она ходит.
 */
const LIMITS: Readonly<Record<JobName, { readonly timeoutSeconds: number; readonly attempts: number }>> = {
  // Модель отвечает секундами. Вторая попытка — на случай ответа мимо схемы.
  'onboarding:proposal': { timeoutSeconds: 300, attempts: 2 },
  // Выписка базы не повторяется: второй прогон заново заводит базу и сносит её при уборке.
  'db:provision': { timeoutSeconds: 900, attempts: 1 },
};

/**
 * Положить работу в очередь. Ключ задаёт постановщик, и это ключ повтора: пока задача
 * с этим ключом не дошла до конца, вторая такая же в очередь не встаёт. Ключ обязан
 * быть у каждой задачи — иначе двойное нажатие оплачивается дважды.
 */
export const enqueue = async <N extends JobName>(name: N, data: Jobs[N], key: string): Promise<string> => {
  const limits = LIMITS[name];
  const job = await queue.add(name, data, {
    jobId: key,
    timeout: limits.timeoutSeconds * 1000,
    attempts: limits.attempts,
  });
  log.info('задача поставлена', { job: name, id: job.id });
  return job.id;
};
