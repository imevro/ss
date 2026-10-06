/**
 * Проверка сведения журнала: лента и ход работы выводятся из записей одним
 * проходом. Проверяем то, что нельзя увидеть глазами: повтор ответа при записи
 * в базу, счёт мыслей, порядок частей.
 *
 * Запуск: bun test app/lib/chat-state.test.ts
 */
import { describe, expect, test } from 'bun:test';

import type { ChatEvent, LogEntry } from '@workspace/types';

import { fold, stateOf, workOfStored } from './chat-state';

const at = (seconds: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

const log = (events: readonly ChatEvent[]): readonly LogEntry[] =>
  events.map((event, index) => ({ at: at(index), event }));

const ask = (id: string, text: string): ChatEvent => ({ kind: 'ask', id, text, at: at(0) });

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

  test('ход работы считает мысли и берёт список инструментов из кадра', () => {
    // Кадр несёт весь список хода: он заменяет прошлый, а не дополняет его.
    const state = fold(
      log([
        { kind: 'started' },
        { kind: 'live', calls: [{ name: 'bash', intent: 'Смотрю файлы' }], thinking: false },
        {
          kind: 'live',
          calls: [
            { name: 'bash', intent: 'Смотрю файлы' },
            { name: 'read', intent: 'Читаю схему' },
          ],
          thinking: true,
        },
        { kind: 'thought' },
        { kind: 'thought' },
        { kind: 'ended' },
      ]),
    );
    expect(state.work?.thoughts).toBe(2);
    expect(state.work?.endedAt).not.toBeNull();
    expect(state.work?.calls.map((call) => call.name)).toEqual(['bash', 'read']);
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
    expect(state.work?.calls).toEqual([]);
    expect(state.work?.thoughts).toBe(0);
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

  test('ход работы записи читается из сырого поля', () => {
    const state = stateOf(
      [
        {
          id: 'db1',
          role: 'assistant',
          text: 'ответ',
          sent_at: at(1),
          raw: { work: { seconds: 7, names: ['bash', 'read'], thoughts: 2 } },
        },
      ],
      [],
    );
    const [message] = state.messages;
    expect(message?.storedWork?.seconds).toBe(7);
    expect(message?.storedWork?.names).toEqual(['bash', 'read']);
  });

  test('чужая форма записи не даёт строки', () => {
    const state = stateOf(
      [{ id: 'db1', role: 'assistant', text: 'ответ', sent_at: at(1), raw: { work: 'мусор' } }],
      [],
    );
    expect(state.messages[0]?.storedWork).toBeUndefined();
  });

  test('запись идущего хода показывает ход идущим: конца у неё нет', () => {
    // Страницу обновили посреди хода: ход читается из записи и продолжает идти.
    const work = workOfStored(
      {
        seconds: 3,
        names: ['bash'],
        thoughts: 1,
        calls: [{ name: 'bash', intent: 'Смотрю файлы' }],
        thinking: true,
        endedAt: null,
      },
      at(3),
    );
    expect(work.thinking).toBe(true);
    expect(work.endedAt).toBeNull();
    expect(work.startedAt).toBe(at(3));
    expect(work.calls.map((call) => call.intent)).toEqual(['Смотрю файлы']);
  });

  test('записанный ответ показывает ход законченным: часы идут от длительности', () => {
    const work = workOfStored({ seconds: 7, names: ['bash', 'read'], thoughts: 2 }, at(7));
    expect(work.thinking).toBe(false);
    expect(work.endedAt).toBe(at(7));
    expect(work.startedAt).toBe(at(0));
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
        raw: { work: { seconds: 2, names: [], thoughts: 0, calls: [], thinking: false, endedAt: null } },
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
        raw: { work: { seconds: 3, names: [], thoughts: 0, calls: [], thinking: false, endedAt: null } },
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
        raw: { work: { seconds: 1, names: [], thoughts: 0, calls: [], thinking: true, endedAt: null } },
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
});
