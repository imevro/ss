/**
 * Мост к агенту. Агент живёт отдельным сервисом и говорит по вебсокету: мы посылаем
 * вопрос, он шлёт куски ответа. Наша работа — переложить их в чат и в комнату.
 *
 * Соединение одно на вопрос: открыли, спросили, дождались конца, закрыли.
 * Ключ комнаты у агента свой (`-<число>:<поток>`), поэтому связка «чат → ключ»
 * хранится в реестре: у одного чата один ключ, у разных — разные.
 */
import { chatTitle } from '@workspace/companies';
import { agentSessions, conversations as chatTable, db, messages, newId } from '@workspace/db';
import { createLogger, logStep } from '@workspace/log';
import type { StoredWork, ToolCall } from '@workspace/types';
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
 * Поток в ключе комнаты агента. Ключ — `-<число>:<поток>`
 * (`.agents/memory/agents/ref-gentic-room-protocol.md`); у нас один поток на чат.
 */
const GENTIC_STREAM = 0;

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
  const key = `-${first.number}:${GENTIC_STREAM}`;
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

/** Ход работы кладётся в запись ответа: вид у него общий с показывающим. */

type Answer = {
  readonly text: string;
  readonly messageId: string | undefined;
  readonly startedAt: number;
  readonly state: TurnState;
  /** Легли ли шаги записи. Не легли — ход нельзя объявлять удавшимся: в ленте его нет. */
  readonly stored: boolean;
};

/** Состояние хода на сейчас: текст, позванные инструменты, мысли. */
type TurnState = {
  readonly text: string;
  readonly calls: readonly ToolCall[];
  readonly thinking: boolean;
  readonly thoughts: number;
};

/** Сколько кусков копим между записями: чаще — лишние записи, реже — больше терять. */
const WRITE_EVERY_CHUNKS = 25;

/**
 * Запись ответа заводится с началом хода и обновляется по ходу. Поэтому у хода есть
 * место в ленте с первой секунды, а страница, обновлённая посреди хода, читает его из
 * базы: второй правды на стороне браузера нет.
 */
const openTurn = async (conversationId: string, messageId: string): Promise<void> => {
  // Начало хода кладём сразу: даже обновление в первую секунду показывает, что ход идёт.
  const work: StoredWork = { seconds: 0, thoughts: 0, calls: [], thinking: true, endedAt: null };
  await db.insert(messages).values({
    id: messageId,
    conversationId,
    role: 'assistant',
    text: '',
    raw: { work },
  });
};

/** Думает ли ход: законченный ход уже не думает. */
const thinkingOf = (ended: boolean, thinking: boolean): boolean => {
  if (ended) return false;
  return thinking;
};

/** Конец хода: время, когда ход закрыли. У идущего хода конца нет. */
const endedAtOf = (ended: boolean): string | null => {
  if (!ended) return null;
  return new Date().toISOString();
};

/** Шаг хода лёг в запись: текст, ход работы и признак конца. */
const writeTurn = async (messageId: string, startedAt: number, state: TurnState, ended: boolean): Promise<void> => {
  const work: StoredWork = {
    // Работа была, раз ответ пришёл: показываем хотя бы секунду, а не «0s».
    seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    thoughts: state.thoughts,
    calls: state.calls,
    thinking: thinkingOf(ended, state.thinking),
    // Конец хода. У идущего его нет — по нему видно, что ход ещё идёт.
    endedAt: endedAtOf(ended),
  };
  await db.update(messages).set({ text: state.text, raw: { work } }).where(eq(messages.id, messageId));
};

/** Ход без ответа: пустая запись в ленте не нужна — убираем её. */
const dropTurn = async (messageId: string): Promise<void> => {
  await db.delete(messages).where(eq(messages.id, messageId));
};

/**
 * Спросить агента и провести ответ в чат. Ответ копится и в памяти, и в записи: память
 * нужна комнате, запись — ленте. Куски уходят в комнату и в запись вместе.
 */
export const askAgent = async (companyId: string, conversationId: string, question: string): Promise<Answer> => {
  const empty: Answer = { text: '', messageId: undefined, startedAt: Date.now(), state: emptyState(), stored: false };
  if (config.agentUrl === '') return empty;
  // Название придумывается рядом с ходом и уходит в комнату само: человек видит
  // вопрос, а список чатов тем временем получает имя. Ход названия не ждёт.
  void nameChat(companyId, conversationId, question);

  const room = conversationRoom(conversationId);
  const key = await genticKeyOf(companyId, conversationId);
  // Ключ не кодируем: у агента он читается из пути как есть, а вид его —
  // `-<число>:<поток>`, то есть только знаки, безопасные в пути.
  const url = `${config.agentUrl}/room/${key}?token=${encodeURIComponent(config.agentSecret)}`;
  const socket = new WebSocket(url);
  const lane = laneOf(companyId, conversationId);
  // Остановка хода: агент отдаёт `done` на то, что успел, и очередь чата идёт дальше.
  const stop = (): void => {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ kind: 'stop' }));
  };
  running.set(lane, stop);
  const startedAt = Date.now();
  const messageId = newId('message');
  const waiter = Promise.withResolvers<Answer>();

  // Списки хода: куски текста, кадры вызовов и мыслей (кадр заменяет прошлый)
  // и число записей. Копилки — реестры кадров, как реестр соединений в комнатах.
  const parts: string[] = [];
  const callLists: (readonly ToolCall[])[] = [];
  const thinkings: boolean[] = [];
  const thoughts: number[] = [];
  const written: number[] = [];
  const writes: Promise<void>[] = [];
  /** Отказы записи. Копится отдельно: `allSettled` исхода не различает. */
  const failed: number[] = [];

  const stateOf = (): TurnState => ({
    text: parts.join(''),
    calls: lastOf(callLists, []),
    thinking: lastFlag(thinkings, false),
    thoughts: thoughts.length,
  });

  /**
   * Шаг записи идёт в копилку. Отказ шага не должен ронять мост: незамеченный отказ
   * гасит процесс целиком, а ход обязан дойти до конца и сказать человеку про беду.
   */
  const record = (step: Promise<void>): void => {
    writes.push(
      step.catch((error: unknown) => {
        log.error('шаг хода не записан', { companyId, messageId, error: String(error) });
        failed.push(1);
      }),
    );
  };

  /** Запись догоняет ход. Ответы записи держим: конец хода ложится последним. */
  const tell = (ended: boolean): void => {
    record(writeTurn(messageId, startedAt, stateOf(), ended));
  };

  /** Ход закончен: закрываем соединение и отдаём ответ наружу. */
  const settle = (final: string): void => {
    running.delete(lane);
    socket.close();
    // Закрытые соединения больше не пишут: очередь обрывается на том, что успело лечь.
    waiter.resolve({
      text: final,
      messageId,
      startedAt,
      state: { ...stateOf(), text: final },
      stored: false,
    });
  };

  // Срок общий на ответ: сработает один раз, а повторное закрытие соединения безвредно.
  const deadline = globalThis.setTimeout(() => settle(''), DEADLINE_MS);
  socket.addEventListener('close', () => {
    globalThis.clearTimeout(deadline);
    // Соединение закрылось само — агент оборвал связь или упал: кадра не будет.
    // Отдаём то, что успело прийти, иначе запись хода и очередь чата повиснут.
    settle(parts.join(''));
  });

  socket.addEventListener('open', () => {
    record(openTurn(conversationId, messageId));
    say(room, { kind: 'started', conversationId, messageId });
    socket.send(JSON.stringify({ kind: 'ask', text: question }));
  });

  socket.addEventListener('message', (message: MessageEvent<string>) => {
    const frame = frameOf(message.data);
    if (frame === undefined) return;
    if (frame.kind === 'chunk') {
      parts.push(frame.text);
      written.push(1);
      if (written.length % WRITE_EVERY_CHUNKS === 0) tell(false);
      say(room, { kind: 'chunk', conversationId, text: frame.text });
      return;
    }
    // Ход работы идёт в комнату как есть: страница собирает из него строку.
    if (frame.kind === 'live') {
      // Список приходит целиком и заменяет прошлый: берём последний кадр.
      callLists.push(frame.calls);
      thinkings.push(frame.thinking);
      tell(false);
      say(room, { kind: 'live', conversationId, calls: frame.calls, thinking: frame.thinking });
      return;
    }
    if (frame.kind === 'thought') {
      thoughts.push(1);
      tell(false);
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

  const answer = await waiter.promise;
  // Конец хода ложится последним: сперва то, что уже в пути, потом итог.
  await Promise.allSettled(writes);
  return { ...answer, stored: failed.length === 0 };
};

/**
 * Название чата по первому вопросу. Идёт рядом с ходом: имя — украшение списка, и
 * неудача не должна мешать ответу. Придуманное имя ложится в запись чата и уходит
 * в комнату, поэтому список обновляется без перезагрузки страницы.
 */
const nameChat = async (companyId: string, conversationId: string, question: string): Promise<void> => {
  try {
    // Шаг открываем до обращения: строка есть, пока модель думает. Расход ложится в неё.
    const step = await logStep.start({
      ctx: { runId: conversationId, companyId, agent: 'agent:title', model: config.llmModel },
      toolName: 'model:chat-title',
      explanation: 'придумываю название чата',
      input: { question },
    });
    const titled = await chatTitle(question, {
      baseURL: config.llmBaseUrl,
      apiKey: config.llmApiKey,
      model: config.llmModel,
    });
    if (!titled.ok) {
      await step.finish({ output: titled.error, kind: 'error' });
      log.info('название чата не придумано', { companyId, conversationId, reason: titled.error.kind });
      return;
    }
    const title = titled.value.answer.title;
    await step.finish({ output: { title }, tokens: titled.value.usage });
    await db.update(chatTable).set({ title }).where(eq(chatTable.id, conversationId));
    say(conversationRoom(conversationId), { kind: 'titled', conversationId, title });
  } catch (error) {
    log.error('название чата не записано', { companyId, conversationId, error: String(error) });
  }
};

/** Пустой ход: агент не отвечал — и работы не было. */
const emptyState = (): TurnState => ({ text: '', calls: [], thinking: false, thoughts: 0 });

/** Последний кадр списка. Кадров не было — берём запасное значение. */
const lastOf = <T>(lists: readonly (readonly T[])[], fallback: readonly T[]): readonly T[] => {
  const last = lists.at(-1);
  if (last === undefined) return fallback;
  return last;
};

/** Последний кадр-признак. Кадров не было — берём запасное значение. */
const lastFlag = (flags: readonly boolean[], fallback: boolean): boolean => {
  const last = flags.at(-1);
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
 * Идущий ход по чату: на ключ хода ложится его остановка. Ход у чата один,
 * поэтому и запись одна. Остановка говорит агенту `stop`: он отдаёт `done` на то,
 * что успел, и очередь чата идёт дальше — так вопрос человека пускается сразу,
 * не дожидаясь конца чужого хода.
 */
const running = new Map<string, () => void>();

/** Ключ хода: у чата один ход за раз, поэтому ключ — это компания и чат вместе. */
const laneOf = (companyId: string, conversationId: string): string => `${companyId}:${conversationId}`;

/** Остановить идущий ход чата. Идущего хода нет — останавливать нечего. */
export const stopTurn = (companyId: string, conversationId: string): void => {
  running.get(laneOf(companyId, conversationId))?.();
};

/**
 * Один ход: спросить агента, дождаться кусков, записать ответ в ленту и только
 * потом объявить конец. Порядок важен: страница по концу читает ленту заново,
 * и запись должна быть уже на месте.
 *
 * Ход запускается без ожидания, поэтому он обязан доводить свои отказы до
 * комнаты сам: иначе человек ждёт ответа, которого не будет.
 */
export const runTurn = (companyId: string, conversationId: string, question: string): void => {
  const lane = laneOf(companyId, conversationId);
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
    if (answer.messageId === undefined) {
      say(room, { kind: 'failed', conversationId, reason: 'агент не ответил' });
      return;
    }
    if (answer.text === '') {
      // Пустая запись в ленте не нужна: ход не состоялся.
      await dropTurn(answer.messageId);
      say(room, { kind: 'failed', conversationId, reason: 'агент не ответил' });
      return;
    }
    // Запись хода не легла — в ленте его нет, значит ход не состоялся: объявлять его
    // удавшимся значило бы соврать странице, которая обновится и ничего не найдёт.
    if (!answer.stored) {
      say(room, { kind: 'failed', conversationId, reason: 'ответ агента не записан' });
      return;
    }
    await writeTurn(answer.messageId, answer.startedAt, answer.state, true);
    await touchConversation(conversationId);
    log.info('ответ агента записан', { companyId, conversationId, length: answer.text.length });
    // Номер записи уходит странице: по нему её собранная реплика уступает записанной.
    say(room, { kind: 'done', conversationId, messageId: answer.messageId });
  } catch (error) {
    log.error('ход не удался', { companyId, conversationId, error: String(error) });
    say(room, { kind: 'failed', conversationId, reason: 'агент недоступен' });
  }
};

/** Список чатов замечает ход по времени последней записи. */
const touchConversation = async (conversationId: string): Promise<void> => {
  await db.update(chatTable).set({ lastMessageAt: new Date() }).where(eq(chatTable.id, conversationId));
};
