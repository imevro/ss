/**
 * Проверка сведения журнала: лента, порядок блоков ответа и ход работы выводятся из
 * записей одним проходом. Проверяем то, что нельзя увидеть глазами: где кончается круг
 * работы, как склеивается текст и как те же блоки получаются из записи в базе.
 *
 * Здесь нет разметки: печать по буквам, Trace, подписку на комнату и строку ввода эта
 * проверка не трогает — у страницы нет ни браузерной среды, ни отрисовки.
 *
 * Запуск: bun test app/lib/chat-state.test.ts
 */
import { describe, expect, test } from 'bun:test';

import type { ChatBlock, ChatEvent, ChatMessage, LogEntry } from '@workspace/types';
import { framesOfRaw, runningOfRaw } from '@workspace/types';

import { fold, stateOf, workOfStored } from './chat-state';

const at = (seconds: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

const log = (events: readonly ChatEvent[]): readonly LogEntry[] =>
  events.map((event, index) => ({ at: at(index), event }));

const ask = (id: string, text: string): ChatEvent => ({ kind: 'ask', id, text, at: at(0) });

/** Блоки последнего ответа агента: лента читается с конца. */
const blocksOf = (messages: readonly ChatMessage[]): readonly ChatBlock[] => {
  const answer = messages.findLast((message) => message.role === 'assistant');
  if (answer === undefined) throw new Error('ответа агента в ленте нет');
  return answer.blocks;
};

/** Блоки реплики по номеру: реплики нет — пусто, это и проверяем. */
const blocksAt = (messages: readonly ChatMessage[], index: number): readonly ChatBlock[] => {
  const message = messages[index];
  if (message === undefined) return [];
  return message.blocks;
};

/** Вид блока одной строкой: `text:привет`, `work:bash,read`. */
const shapesOf = (blocks: readonly ChatBlock[]): readonly string[] =>
  blocks.map((block) => {
    if (block.type === 'text') return `text:${block.text}`;
    return `work:${block.calls.map((call) => call.name).join(',')}`;
  });

describe('сведение журнала', () => {
  test('вопрос и ответ ложатся в ленту по порядку', () => {
    const state = fold(
      log([
        ask('m1', 'привет'),
        { kind: 'started' },
        { kind: 'chunk', text: 'при' },
        { kind: 'chunk', text: 'вет' },
        { kind: 'ended' },
      ]),
    );
    expect(state.messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:привет',
      'assistant:привет',
    ]);
  });

  test('ответ идёт кругами: слова, работа, слова, работа, слова', () => {
    // Каждый круг работы закрывается, когда начинаются следующие слова: поэтому у
    // каждого круга свои часы, а текст не склеивается в один блок.
    const state = fold(
      log([
        { kind: 'started' },
        { kind: 'chunk', text: 'Смотрю' },
        { kind: 'live', calls: [{ name: 'bash', intent: 'Смотрю файлы' }], thinking: false },
        { kind: 'chunk', text: 'Нашёл' },
        { kind: 'live', calls: [{ name: 'read', intent: 'Читаю схему' }], thinking: true },
        { kind: 'chunk', text: 'Готово' },
        { kind: 'ended' },
      ]),
    );
    expect(shapesOf(blocksOf(state.messages))).toEqual([
      'text:Смотрю',
      'work:bash',
      'text:Нашёл',
      'work:read',
      'text:Готово',
    ]);
    expect(state.messages.at(-1)?.text).toBe('СмотрюНашёлГотово');
  });

  test('круг работы берёт часы от своих кадров', () => {
    // Записи идут по секунде: круг открылся на первой, закрылся следующей записью.
    const state = fold(
      log([
        { kind: 'started' },
        { kind: 'live', calls: [{ name: 'bash', intent: 'Смотрю' }], thinking: false },
        { kind: 'chunk', text: 'готово' },
      ]),
    );
    const work = blocksOf(state.messages).find((block) => block.type === 'work');
    if (work === undefined || work.type !== 'work') throw new Error('круга работы нет');
    expect(work.startedAt).toBe(at(1));
    expect(work.endedAt).toBe(at(2));
  });

  test('кадр без вызовов блока не заводит, а мысль до вызова заводит круг', () => {
    // `live` с пустым списком — это ещё не работа, а признак мысли: своего блока нет.
    // Мысль до первого вызова — уже круг: строка хода должна быть видна.
    const quiet = fold(log([{ kind: 'started' }, { kind: 'live', calls: [], thinking: true }, { kind: 'ended' }]));
    expect(blocksOf(quiet.messages)).toEqual([]);
    expect(quiet.running).toBe(false);

    const thought = fold(log([{ kind: 'started' }, { kind: 'thought' }, { kind: 'ended' }]));
    expect(shapesOf(blocksOf(thought.messages))).toEqual(['work:']);
    const work = blocksOf(thought.messages)[0];
    if (work === undefined || work.type !== 'work') throw new Error('круга работы нет');
    expect(work.thoughts).toBe(1);
  });

  test('ход идёт, пока в журнале нет конца', () => {
    const open = fold(log([{ kind: 'started' }, { kind: 'chunk', text: 'раз' }]));
    expect(open.running).toBe(true);
    const closed = fold(log([{ kind: 'started' }, { kind: 'chunk', text: 'раз' }, { kind: 'ended' }]));
    expect(closed.running).toBe(false);
    // Сорванный ход тоже кончается: круг закрыт, хода больше нет.
    const failed = fold(log([{ kind: 'started' }, { kind: 'failed', reason: 'нет связи' }]));
    expect(failed.running).toBe(false);
    expect(failed.problem).toBe('нет связи');
  });

  test('новый вопрос начинает ход заново: прошлые инструменты не тянутся', () => {
    const state = fold(
      log([
        ask('m1', 'первый'),
        { kind: 'started' },
        { kind: 'live', calls: [{ name: 'bash', intent: 'Работал' }], thinking: false },
        { kind: 'ended' },
        ask('m2', 'второй'),
        { kind: 'started' },
        { kind: 'live', calls: [], thinking: true },
      ]),
    );
    expect(blocksOf(state.messages)).toEqual([]);
    expect(state.running).toBe(true);
  });

  test('запись с журналом сводится в те же блоки, что живой журнал', () => {
    const frames: readonly LogEntry[] = [
      { at: at(1), event: { kind: 'chunk', text: 'Смотрю' } },
      { at: at(2), event: { kind: 'live', calls: [{ name: 'bash', intent: 'Смотрю файлы' }], thinking: false } },
      { at: at(3), event: { kind: 'chunk', text: 'Готово' } },
      { at: at(4), event: { kind: 'ended' } },
    ];
    const stored = [{ id: 'db1', role: 'assistant', text: '', sent_at: at(0), raw: { frames } }];
    const state = stateOf(stored, []);
    expect(shapesOf(blocksAt(state.messages, 0))).toEqual(['text:Смотрю', 'work:bash', 'text:Готово']);
    expect(state.messages[0]?.text).toBe('СмотрюГотово');
    expect(state.messages[0]?.id).toBe('db-db1');
  });

  test('идущая запись считается идущей, пока в журнале нет конца', () => {
    const open: readonly LogEntry[] = [{ at: at(1), event: { kind: 'chunk', text: 'раз' } }];
    expect(runningOfRaw({ frames: open })).toBe(true);
    expect(runningOfRaw({ frames: [] })).toBe(true);
    const closed: readonly LogEntry[] = [...open, { at: at(2), event: { kind: 'ended' } }];
    expect(runningOfRaw({ frames: closed })).toBe(false);
    const failed: readonly LogEntry[] = [...open, { at: at(2), event: { kind: 'failed', reason: 'сбой' } }];
    expect(runningOfRaw({ frames: failed })).toBe(false);
    // Старой записи журнала не знать: её ход идёт, пока у сводки нет конца.
    expect(runningOfRaw({ work: { seconds: 1, thoughts: 0, endedAt: null } })).toBe(true);
    expect(runningOfRaw({ work: { seconds: 1, thoughts: 0 } })).toBe(false);
  });

  test('старая запись даёт ход сводкой и текст после него', () => {
    // Записи до переезда несут готовый ход: круг один, и он стоит перед текстом.
    const state = stateOf(
      [
        {
          id: 'db1',
          role: 'assistant',
          text: 'ответ',
          sent_at: at(120),
          raw: { work: { seconds: 30, names: ['bash', 'read'], thoughts: 2 } },
        },
      ],
      [],
    );
    expect(shapesOf(blocksAt(state.messages, 0))).toEqual(['work:bash,read', 'text:ответ']);
    const work = state.messages[0]?.blocks[0];
    if (work === undefined || work.type !== 'work') throw new Error('круга работы нет');
    // Часы строятся от длительности записи: конец — время ответа.
    expect(work.endedAt).toBe(at(120));
    expect(work.thoughts).toBe(2);
  });

  test('испорченный журнал не ломает ленту', () => {
    // Поле не массив — считаем, что журнала нет: реплика покажется без блоков.
    expect(framesOfRaw({ frames: 'мусор' })).toBeUndefined();
    const broken = stateOf(
      [{ id: 'db1', role: 'assistant', text: 'ответ', sent_at: at(0), raw: { frames: 'мусор' } }],
      [],
    );
    expect(broken.messages[0]?.text).toBe('ответ');
    // Чужие кадры пропускаются: реплика остаётся текстом, а не падением.
    const state = stateOf(
      [
        {
          id: 'db2',
          role: 'assistant',
          text: 'ответ',
          sent_at: at(0),
          raw: {
            frames: [{ at: at(1), event: { kind: 'чушь' } }, { nope: true }, { at: at(2), event: { kind: 'ended' } }],
          },
        },
      ],
      [],
    );
    expect(state.messages[0]?.text).toBe('ответ');
    expect(shapesOf(blocksAt(state.messages, 0))).toEqual(['text:ответ']);
  });

  test('записанный ответ и собранный из кусков не показываются дважды', () => {
    const entries = log([
      ask('m1', 'вопрос'),
      { kind: 'asked', id: 'm1', messageId: 'db1' },
      { kind: 'started' },
      { kind: 'chunk', text: 'ответ' },
      { kind: 'ended', messageId: 'db2' },
    ]);
    const stored = [
      { id: 'db1', role: 'user', text: 'вопрос', sent_at: at(0) },
      { id: 'db2', role: 'assistant', text: 'ответ', sent_at: at(1) },
    ];
    const state = stateOf(stored, entries);
    expect(state.messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:вопрос',
      'assistant:ответ',
    ]);
  });

  test('два одинаковых вопроса подряд остаются оба', () => {
    const state = fold(log([ask('m1', 'ещё'), ask('m2', 'ещё')]));
    expect(state.messages.map((message) => message.text)).toEqual(['ещё', 'ещё']);
  });

  test('второй такой же вопрос не пропадает рядом с записанным первым', () => {
    // Первый вопрос уже в базе, второй — только в журнале. Текст один и тот же.
    const stored = [{ id: 'db1', role: 'user', text: 'ещё', sent_at: at(0) }];
    const state = stateOf(
      stored,
      log([ask('me1', 'ещё'), { kind: 'asked', id: 'me1', messageId: 'db1' }, ask('me2', 'ещё')]),
    );
    expect(state.messages.map((message) => `${message.role}:${message.text}`)).toEqual(['user:ещё', 'user:ещё']);
  });

  test('недописанный собранный ответ уступает записи сервера', () => {
    // В базе целый ответ, в журнале — только его начало: показать надо один раз.
    const stored = [
      { id: 'db1', role: 'user', text: 'вопрос', sent_at: at(0) },
      { id: 'db2', role: 'assistant', text: 'Привет! Чем помочь?', sent_at: at(1) },
    ];
    const state = stateOf(
      stored,
      log([
        ask('me1', 'вопрос'),
        { kind: 'asked', id: 'me1', messageId: 'db1' },
        { kind: 'started' },
        { kind: 'chunk', text: 'Привет' },
        { kind: 'ended', messageId: 'db2' },
      ]),
    );
    const assistant = state.messages.filter((message) => message.role === 'assistant');
    expect(assistant.map((message) => message.text)).toEqual(['Привет! Чем помочь?']);
  });

  test('ход приходит и из журнала, и из базы, а показывается один раз', () => {
    // Номер записи приходит первым кадром хода: реплика журнала и запись базы — одна
    // и та же реплика. Без этого номера ход показался бы в ленте дважды.
    const stored = [
      { id: 'db1', role: 'user', text: 'вопрос', sent_at: at(0) },
      { id: 'db2', role: 'assistant', text: 'ответ', sent_at: at(3) },
      { id: 'db3', role: 'user', text: 'следующий', sent_at: at(9) },
    ];
    const state = stateOf(
      stored,
      log([
        ask('m1', 'вопрос'),
        { kind: 'asked', id: 'm1', messageId: 'db1' },
        { kind: 'started', messageId: 'db2' },
        { kind: 'chunk', text: 'ответ' },
      ]),
    );
    expect(state.messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:вопрос',
      'assistant:ответ',
      'user:следующий',
    ]);
  });

  test('идущий ход остаётся: его ответа в базе ещё нет', () => {
    const stored = [
      { id: 'db1', role: 'user', text: 'первый', sent_at: at(0) },
      { id: 'db2', role: 'assistant', text: 'первый ответ', sent_at: at(2) },
    ];
    const entries: readonly LogEntry[] = [
      { at: at(10), event: ask('m2', 'второй') },
      { at: at(11), event: { kind: 'started' } },
      { at: at(12), event: { kind: 'chunk', text: 'сейчас отвечу' } },
    ];
    const state = stateOf(stored, entries);
    expect(state.messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:первый',
      'assistant:первый ответ',
      'user:второй',
      'assistant:сейчас отвечу',
    ]);
  });

  test('старая запись с одними именами даёт список вызовов: имя становится замыслом', () => {
    // Запись собирает `workOfRaw`, и он всегда кладёт `calls` — пусть пустым. Значит
    // разбор одних имён виден лишь там, где ход собран мимо разбора, рукой.
    expect(workOfStored({ seconds: 7, names: ['bash', 'read'], thoughts: 2 }, at(7)).calls).toEqual([
      { name: 'bash', intent: 'bash' },
      { name: 'read', intent: 'read' },
    ]);
  });

  test('запись без хода и запись с чужим ходом дают реплику без круга', () => {
    const state = stateOf(
      [{ id: 'db1', role: 'assistant', text: 'ответ', sent_at: at(1), raw: { work: { seconds: 4, thoughts: 0 } } }],
      [],
    );
    expect(shapesOf(blocksAt(state.messages, 0))).toEqual(['work:', 'text:ответ']);
  });

  test('чужая форма записи не даёт круга', () => {
    const state = stateOf(
      [{ id: 'db1', role: 'assistant', text: 'ответ', sent_at: at(1), raw: { work: 'мусор' } }],
      [],
    );
    expect(shapesOf(blocksAt(state.messages, 0))).toEqual(['text:ответ']);
  });

  test('запись идущего хода показывает ход идущим: конца у неё нет', () => {
    // Страницу обновили посреди хода: ход читается из записи и продолжает идти.
    // Длительность здесь нарочно не равна времени записи: идущий ход берёт часы
    // от времени записи, а не длительность.
    const work = workOfStored(
      {
        seconds: 30,
        names: ['bash'],
        thoughts: 1,
        calls: [{ name: 'bash', intent: 'Смотрю файлы' }],
        thinking: true,
        endedAt: null,
      },
      at(120),
    );
    expect(work.thinking).toBe(true);
    expect(work.endedAt).toBeNull();
    expect(work.startedAt).toBe(at(120));
    expect(work.calls.map((call) => call.intent)).toEqual(['Смотрю файлы']);
  });

  test('записанный ответ показывает ход законченным: часы идут от длительности', () => {
    // Длительность и время ответа нарочно разные: у записи 30 секунд, ответ пришёл
    // на 120-й секунде — начало хода на 90-й. Будь они равны, проверка проходила бы и
    // с перепутанной единицей измерения.
    const work = workOfStored({ seconds: 30, names: ['bash', 'read'], thoughts: 2 }, at(120));
    expect(work.thinking).toBe(false);
    expect(work.endedAt).toBe(at(120));
    expect(work.startedAt).toBe(at(90));
    expect(work.calls.map((call) => call.name)).toEqual(['bash', 'read']);
  });

  test('второй вопрос виден сразу, а после прихода ленты не двоится', () => {
    // Первый вопрос записан, второй только что отправлен: журнал помнит не всё.
    const stored = [{ id: 'db1', role: 'user', text: 'первый', sent_at: at(0) }];
    const entries = log([ask('me-2', 'второй'), { kind: 'asked', id: 'me-2', messageId: 'db2' }]);
    const before = stateOf(stored, entries);
    expect(before.messages.map((message) => message.text)).toEqual(['первый', 'второй']);
    // Запись доехала: та же реплика берётся из ленты, дубля нет.
    const after = stateOf([...stored, { id: 'db2', role: 'user', text: 'второй', sent_at: at(1) }], entries);
    expect(after.messages.map((message) => message.text)).toEqual(['первый', 'второй']);
  });

  test('испорченная запись хранилища не ломает ленту', () => {
    const state = fold([
      { at: at(0), event: ask('m1', 'живой') },
      { at: at(1), event: { kind: 'чушь' } as unknown as ChatEvent },
    ]);
    expect(state.messages.map((message) => message.text)).toEqual(['живой']);
  });

  test('подписка посреди хода: собранная реплика заменяет идущую запись', () => {
    // Кадра `started` страница не видела: в журнале только куски. Идущая запись в
    // ленте уже есть (её заводит API с началом хода) — реплика должна быть одна.
    const stored = [
      { id: 'db1', role: 'user', text: 'вопрос', sent_at: at(0) },
      {
        id: 'db2',
        role: 'assistant',
        text: 'Привет',
        sent_at: at(1),
        raw: { frames: [{ at: at(1), event: { kind: 'chunk', text: 'Привет' } }] },
      },
    ];
    const state = stateOf(
      stored,
      log([
        { kind: 'chunk', text: 'Привет, ' },
        { kind: 'chunk', text: 'чем помочь?' },
      ]),
    );
    expect(state.messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:вопрос',
      'assistant:Привет, чем помочь?',
    ]);
  });

  test('конец хода после подписки посреди хода: номер записи ложится на реплику', () => {
    const stored = [
      { id: 'db1', role: 'user', text: 'вопрос', sent_at: at(0) },
      {
        id: 'db2',
        role: 'assistant',
        text: 'ответ',
        sent_at: at(1),
        raw: { frames: [{ at: at(1), event: { kind: 'chunk', text: 'ответ' } }] },
      },
    ];
    const entries = log([
      { kind: 'chunk', text: 'ответ' },
      { kind: 'ended', messageId: 'db2' },
    ]);
    expect(stateOf(stored, entries).messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:вопрос',
      'assistant:ответ',
    ]);
  });

  test('ход с первым кадром: реплика одна и в ней всё, что успело прийти', () => {
    const stored = [
      { id: 'db1', role: 'user', text: 'вопрос', sent_at: at(0) },
      {
        id: 'db2',
        role: 'assistant',
        text: 'При',
        sent_at: at(1),
        raw: { frames: [{ at: at(1), event: { kind: 'chunk', text: 'При' } }] },
      },
    ];
    const entries = log([
      { kind: 'asked', id: 'm1', messageId: 'db1' },
      { kind: 'started', messageId: 'db2' },
      { kind: 'chunk', text: 'Привет' },
    ]);
    expect(stateOf(stored, entries).messages.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:вопрос',
      'assistant:Привет',
    ]);
  });

  test('строка агента живёт до следующего вопроса, а не до конца сеанса', () => {
    // Строка из потока ошибок относится к своему ходу: новый вопрос её снимает.
    const seen = fold(log([{ kind: 'started' }, { kind: 'log', text: 'ошибка провайдера' }]));
    expect(seen.note).toBe('ошибка провайдера');
    const next = fold(log([{ kind: 'started' }, { kind: 'log', text: 'ошибка' }, ask('m1', 'ещё раз')]));
    expect(next.note).toBe('');
  });
});
