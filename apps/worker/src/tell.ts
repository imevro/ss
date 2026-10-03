/**
 * Слово в комнату. Воркер не держит соединений с браузером — соединения держит API,
 * поэтому воркер стучится в его вход и рассказывает, что случилось.
 */
import { createLogger } from '@workspace/log';
import type { ClientEvent } from '@workspace/types';

import { config } from './env';

const log = createLogger('tell');

/** Сказать комнате. Отказ не роняет работу: воркер уже сделал своё дело. */
export const tell = async (room: string, event: ClientEvent): Promise<void> => {
  if (config.apiUrl === '' || config.workerToken === '') {
    log.warn('живой поток не настроен: события копятся только в базе', { room });
    return;
  }
  try {
    const response = await fetch(`${config.apiUrl}/v1/events/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ss-token': config.workerToken },
      body: JSON.stringify({ room, event }),
    });
    if (!response.ok) log.warn('комната не приняла событие', { room, code: response.status });
  } catch (error) {
    log.warn('комната недоступна', { room, error: String(error) });
  }
};
