/**
 * Мост к агенту. Агент живёт отдельным сервисом и говорит по вебсокету: мы посылаем
 * вопрос, он шлёт куски ответа. Наша работа — переложить их в чат и в комнату.
 *
 * Соединение одно на вопрос: открыли, спросили, дождались конца, закрыли.
 * Ключ комнаты у агента свой (`-<число>:<поток>`), поэтому связка «чат → ключ»
 * хранится в реестре: у одного чата один ключ, у разных — разные.
 */
import { chatTitle } from '@workspace/companies';
import { agentSessions, db, newId, platformSql } from '@workspace/db';
import { createLogger } from '@workspace/log';
import type { ToolCall } from '@workspace/types';
import { conversationRoom } from '@workspace/types';
import { and, eq, sql } from 'drizzle-orm';

import { config } from './env';
import { say } from './rooms';

const log = createLogger('agent');

/** Кадр от агента. Разбор на границе: дальше только свои виды. */
type AgentFrame =
  | { readonly kind: 'started' }
  | { readonly kind: 'chunk'; readonly text: string }
  | { readonly kind: 'live'; readonly calls: readonly ToolCall[]; readonly thinking: boolean }
  | { readonly kind: 'thought' }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string };

const frameOf = (raw: string): AgentFrame | undefined => {
  const parsed = parseJson(raw);
  if (parsed === null) return;
  if (typeof parsed !== 'object') return;
  const frame = parsed as Record<string, unknown>;
  if (frame.kind === 'started') return { kind: 'started' };
  if (frame.kind === 'done') return { kind: 'done' };
  // Поля берём только нужного вида: чужая подстановка не должна стать текстом
  // ответа. Кадр без поля — это не «пусто», а испорченный кадр.
  if (frame.kind === 'failed') {
    if (typeof frame.reason !== 'string') return;
    return { kind: 'failed', reason: frame.reason };
  }
  if (frame.kind === 'chunk') {
    if (typeof frame.text !== 'string') return;
    return { kind: 'chunk', text: frame.text };
  }
  if (frame.kind === 'thought') return { kind: 'thought' };
  if (frame.kind === 'live') {
    const calls = callsOf(frame.calls);
    if (calls === undefined) return;
    return { kind: 'live', calls, thinking: frame.thinking === true };
  }
};

/** Позванные инструменты: список приходит целиком, поэтому и проверяем целиком. */
const callsOf = (value: unknown): readonly ToolCall[] | undefined => {
  if (!Array.isArray(value)) return;
  // Кадр несёт весь список хода и заменяет прошлый. Один испорченный элемент
  // не должен обнулять уже показанную работу: теряем элемент, а не кадр.
  return value.flatMap((call) => {
    if (typeof call !== 'object' || call === null) return [];
    const named = call as Record<string, unknown>;
    if (typeof named.name !== 'string' || typeof named.intent !== 'string') return [];
    return [{ name: named.name, intent: named.intent }];
  });
};

/** Разбор кадра: мусор от чужого соединения не должен ронять мост. */
const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Сколько ждать ответа целиком. Дольше — считаем, что агент не ответил.
 * Срок с запасом: первый ход у боевого агента поднимает сессию и идёт минутами.
 */
const DEADLINE_MS = 600_000;

/**
 * Ключ комнаты агента. Агент принимает только `-<число>:<поток>`. Номер берём из
 * последовательности: она выдаёт его одним действием, и два одновременных чата
 * не получают один номер. Повтор вставки — это гонка двух запросов на одну чат:
 * выигравший уже записал ключ, проигравший читает готовый.
 */
const genticKeyOf = async (companyId: string, conversationId: string): Promise<string> => {
  const found = await db
    .select({ key: agentSessions.genticKey })
    .from(agentSessions)
    .where(and(eq(agentSessions.companyId, companyId), eq(agentSessions.conversationId, conversationId)))
    .limit(1);
  const existing = found[0];
  if (existing !== undefined) return existing.key;

  const rows = await db.execute<{ number: number }>(sql`select nextval('agent_session_number') as number`);
  const first = rows[0];
  // Последовательность без строки — это не «нет номера», а сломанная схема.
  // Молча подставить единицу значило бы выдать чужой ключ.
  if (first === undefined) throw new Error('последовательность номеров не ответила');
  const key = `-${first.number}:0`;
  const written = await db
    .insert(agentSessions)
    .values({ id: newId('agentSession'), companyId, conversationId, genticKey: key })
    .onConflictDoNothing()
    .returning({ key: agentSessions.genticKey });
  const raced = written[0];
  if (raced !== undefined) return raced.key;

  const again = await db
    .select({ key: agentSessions.genticKey })
    .from(agentSessions)
    .where(and(eq(agentSessions.companyId, companyId), eq(agentSessions.conversationId, conversationId)))
    .limit(1);
  const settled = again[0];
  if (settled === undefined) throw new Error('ключ комнаты не записан');
  return settled.key;
};

/**
 * Ход работы целиком за время хода. Копится здесь, ложится в запись ответа вместе
 * с текстом: страница берёт строку из записи и показывает её с первого кадра.
 */
export type TurnWork = {
  readonly seconds: number;
  readonly names: readonly string[];
  readonly thoughts: number;
};

type Answer = { readonly text: string; readonly work: TurnWork };

/**
 * Спросить агента и провести ответ в чат. Возвращает текст ответа и ход работы.
 * Работа идёт на глазах человека: куски уходят в комнату чата.
 */
export const askAgent = async (companyId: string, conversationId: string, question: string): Promise<Answer> => {
  if (config.agentUrl === '') return { text: '', work: emptyWork() };
  // Название придумывается рядом с ходом и уходит в комнату само: человек видит
  // вопрос, а список чатов тем временем получает имя. Ход названия не ждёт.
  void nameChat(companyId, conversationId, question);

  const room = conversationRoom(conversationId);
  const key = await genticKeyOf(companyId, conversationId);
  // Ключ не кодируем: у агента он читается из пути как есть, а вид его —
  // `-<число>:<поток>`, то есть только знаки, безопасные в пути.
  const url = `${config.agentUrl}/room/${key}?token=${encodeURIComponent(config.agentSecret)}`;
  const socket = new WebSocket(url);
  const startedAt = Date.now();
  const waiter = Promise.withResolvers<Answer>();

  // Списки хода: куски текста, кадры имён (каждый заменяет прошлый) и число мыслей.
  // Копилки — реестры кадров, как реестр соединений в комнатах: значение, не счётчик.
  const parts: string[] = [];
  const nameLists: (readonly string[])[] = [];
  const thoughts: number[] = [];

  /** Ход закончен: закрываем соединение и отдаём ответ наружу. */
  const settle = (final: string): void => {
    socket.close();
    waiter.resolve({
      text: final,
      work: {
        // Работа была, раз ответ пришёл: показываем хотя бы секунду, а не «0s».
        seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        names: lastOf(nameLists, []),
        thoughts: thoughts.length,
      },
    });
  };

  // Срок общий на ответ: сработает один раз, а повторное закрытие соединения безвредно.
  const deadline = globalThis.setTimeout(() => settle(''), DEADLINE_MS);
  socket.addEventListener('close', () => globalThis.clearTimeout(deadline));

  socket.addEventListener('open', () => {
    say(room, { kind: 'started', conversationId });
    socket.send(JSON.stringify({ kind: 'ask', text: question }));
  });

  socket.addEventListener('message', (message: MessageEvent<string>) => {
    const frame = frameOf(message.data);
    if (frame === undefined) return;
    if (frame.kind === 'chunk') {
      parts.push(frame.text);
      say(room, { kind: 'chunk', conversationId, text: frame.text });
      return;
    }
    // Ход работы идёт в комнату как есть: страница собирает из него строку.
    if (frame.kind === 'live') {
      // Список приходит целиком и заменяет прошлый: берём последний кадр.
      nameLists.push(frame.calls.map((call) => call.name));
      say(room, { kind: 'live', conversationId, calls: frame.calls, thinking: frame.thinking });
      return;
    }
    if (frame.kind === 'thought') {
      thoughts.push(1);
      say(room, { kind: 'thought', conversationId });
      return;
    }
    if (frame.kind === 'done') {
      settle(parts.join(''));
      return;
    }
    if (frame.kind === 'failed') {
      say(room, { kind: 'failed', conversationId, reason: frame.reason });
      settle('');
    }
  });

  socket.addEventListener('error', () => {
    say(room, { kind: 'failed', conversationId, reason: 'агент недоступен' });
    settle('');
  });

  return waiter.promise;
};

/**
 * Название чата по первому вопросу. Идёт рядом с ходом: имя — украшение списка, и
 * неудача не должна мешать ответу. Придуманное имя ложится в запись чата и уходит
 * в комнату, поэтому список обновляется без перезагрузки страницы.
 */
const nameChat = async (companyId: string, conversationId: string, question: string): Promise<void> => {
  try {
    const tenant = await platformSql(companyId);
    if (tenant === undefined) return;
    const titled = await chatTitle(question, {
      baseURL: config.llmBaseUrl,
      apiKey: config.llmApiKey,
      model: config.llmModel,
    });
    if (!titled.ok) {
      log.info('название чата не придумано', { companyId, conversationId, reason: titled.error.kind });
      return;
    }
    await tenant`
      UPDATE ctx.conversations SET title = ${titled.value.title} WHERE id = ${conversationId}
    `;
    say(conversationRoom(conversationId), {
      kind: 'titled',
      conversationId,
      title: titled.value.title,
    });
  } catch (error) {
    log.error('название чата не записано', { companyId, conversationId, error: String(error) });
  }
};

/** Пустой ход: агент не отвечал — и работы не было. */
const emptyWork = (): TurnWork => ({ seconds: 0, names: [], thoughts: 0 });

/** Последний кадр списка. Кадров не было — пустой список. */
const lastOf = (lists: readonly (readonly string[])[], fallback: readonly string[]): readonly string[] => {
  const last = lists.at(-1);
  if (last === undefined) return fallback;
  return last;
};

/**
 * Ходы идут по очереди: у чата одна память у агента, и два одновременных
 * вопроса перемешают куски двух ответов в одну ленту. Очередь по чату —
 * список обещаний, а не отдельная служба: ход и так живёт в этом процессе.
 */
const pending = new Map<string, Promise<void>>();

/**
 * Один ход: спросить агента, дождаться кусков, записать ответ в ленту и только
 * потом объявить конец. Порядок важен: страница по концу читает ленту заново,
 * и запись должна быть уже на месте.
 *
 * Ход запускается без ожидания, поэтому он обязан доводить свои отказы до
 * комнаты сам: иначе человек ждёт ответа, которого не будет.
 */
export const runTurn = (companyId: string, conversationId: string, question: string): void => {
  const lane = `${companyId}:${conversationId}`;
  const earlier = pending.get(lane);
  const start = async (): Promise<void> => {
    if (earlier !== undefined) await earlier;
    await turnOf(companyId, conversationId, question);
  };
  const turn = start();
  pending.set(lane, turn);
  void turn.then(() => {
    if (pending.get(lane) === turn) pending.delete(lane);
  });
};

/** Сам ход. Отказ превращается в событие комнаты: человек ждёт ответа, а не тишины. */
const turnOf = async (companyId: string, conversationId: string, question: string): Promise<void> => {
  const room = conversationRoom(conversationId);
  try {
    const answer = await askAgent(companyId, conversationId, question);
    if (answer.text === '') {
      say(room, { kind: 'failed', conversationId, reason: 'агент не ответил' });
      return;
    }
    const messageId = await storeAnswer(companyId, conversationId, answer);
    log.info('ответ агента записан', { companyId, conversationId, length: answer.text.length });
    // Номер записи уходит странице: по нему её собранная реплика уступает записанной.
    if (messageId === undefined) {
      say(room, { kind: 'done', conversationId });
      return;
    }
    say(room, { kind: 'done', conversationId, messageId });
  } catch (error) {
    log.error('ход не удался', { companyId, conversationId, error: String(error) });
    say(room, { kind: 'failed', conversationId, reason: 'агент недоступен' });
  }
};

/**
 * Ответ агента ложится в ту же чат. Ход работы едет в сыром поле записи: страница
 * берёт строку оттуда, поэтому она приходит вместе с лентой и не мигает.
 */
const storeAnswer = async (companyId: string, conversationId: string, answer: Answer): Promise<string | undefined> => {
  const tenant = await platformSql(companyId);
  if (tenant === undefined) return;
  const messageId = newId('message');
  const raw = JSON.stringify({ work: answer.work });
  await tenant`
    INSERT INTO ctx.messages (id, conversation_id, role, author_name, text, raw)
    VALUES (${messageId}, ${conversationId}, ${'assistant'}, ${'агент'}, ${answer.text}, ${raw}::jsonb)
  `;
  await tenant`
    UPDATE ctx.conversations SET last_message_at = now() WHERE id = ${conversationId}
  `;
  return messageId;
};
