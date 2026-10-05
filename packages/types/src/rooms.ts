import type { ToolCall } from './chat';

/**
 * Имена комнат живого потока. Одно место на всех: воркер говорит в комнату,
 * API держит её, браузер в неё подписан.
 */

/** Комната онбординга: ждём готовое предложение таблиц. */
export const onboardingRoom = (userId: string): string => `onboarding:${userId}`;

/** Комната чата: ответ агента идёт по кускам. */
export const conversationRoom = (conversationId: string): string => `conversation:${conversationId}`;

/**
 * Что уходит в браузер. Виды одни на все комнаты.
 *
 * `live` — ход работы агента: весь список позванных инструментов и признак того,
 * что сейчас думает сам агент. Список приходит целиком и заменяет прошлый:
 * страница ничего не досчитывает сама.
 */
export type ClientEvent =
  | { readonly kind: 'proposal'; readonly proposal: unknown }
  | {
      readonly kind: 'started';
      readonly conversationId: string;
      /** Номер записи ответа: ход заводится в базе сразу, страница знает его первым кадром. */
      readonly messageId?: string;
    }
  | { readonly kind: 'chunk'; readonly conversationId: string; readonly text: string }
  /** Название чата: приходит, как только модель его придумала. */
  | { readonly kind: 'titled'; readonly conversationId: string; readonly title: string }
  | {
      readonly kind: 'live';
      readonly conversationId: string;
      readonly calls: readonly ToolCall[];
      readonly thinking: boolean;
    }
  | { readonly kind: 'thought'; readonly conversationId: string }
  | {
      readonly kind: 'done';
      readonly conversationId: string;
      /** Номер записи ответа в базе: по нему собранная реплика уступает записанной. */
      readonly messageId?: string;
    }
  | { readonly kind: 'failed'; readonly conversationId: string; readonly reason: string }
  | { readonly kind: 'problem'; readonly reason: string };

/** Позванный инструмент: имя и замысел. Вид живёт в `chat.ts`. */
export type { ToolCall } from './chat';
