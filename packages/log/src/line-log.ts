/**
 * Строчный журнал: уровни, префикс-модуль, поля данных. Пишет строку JSON в файл
 * за сегодня и, если включено, дублирует в stderr.
 *
 * Состояние одно на процесс и задаётся при запуске. Настройки журнала читает
 * запуск приложения, а не этот модуль: тут только значения по умолчанию.
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export type LogData = Record<string, unknown>;

export type LogEntry = {
  readonly ts: string;
  readonly level: LogLevel;
  readonly module: string;
  readonly msg: string;
  /** Прогон или сессия, к которым относится запись. */
  readonly run?: string;
  readonly data?: LogData;
};

export type Logger = {
  debug(msg: string, data?: LogData): void;
  info(msg: string, data?: LogData): void;
  warn(msg: string, data?: LogData): void;
  error(msg: string, data?: LogData): void;
};

export type LoggerOptions = {
  /** Каталог для файлов. Не задан — пишем только в stderr. */
  readonly dir?: string;
  readonly level?: LogLevel;
  readonly console?: boolean;
  /** Общий признак прогона, подставляется в каждую запись. */
  readonly run?: string;
};

/** Единственная изменяемая точка: настройка процесса, заполняется один раз. */
const state: { dir?: string; level: LogLevel; console: boolean; run?: string } = {
  level: 'info',
  console: true,
};

export const configureLogger = (options: LoggerOptions): void => {
  if (options.dir !== undefined) state.dir = options.dir;
  if (options.level !== undefined) state.level = options.level;
  if (options.console !== undefined) state.console = options.console;
  if (options.run !== undefined) state.run = options.run;
};

const runField = (run: string | undefined): { run?: string } => {
  if (run === undefined) return {};
  return { run };
};

const dataField = (data: LogData | undefined): { data?: LogData } => {
  if (data === undefined || Object.keys(data).length === 0) return {};
  return { data };
};

const dataSuffix = (data: LogData | undefined): string => {
  if (data === undefined) return '';
  return ` ${JSON.stringify(data)}`;
};

/** Каталог журнала как часть настроек: пустое значение — журнала в файл нет. */
export const dirOption = (dir: string | undefined): { dir?: string } => {
  if (dir === undefined || dir === '') return {};
  return { dir };
};

const todayFile = (): string => `${new Date().toISOString().slice(0, 10)}.jsonl`;

/** Запись в файл не должна ронять работу: любая беда с диском остаётся бедой диска. */
const writeEntry = (entry: LogEntry): void => {
  if (state.dir === undefined) return;
  try {
    if (!existsSync(state.dir)) mkdirSync(state.dir, { recursive: true });
    appendFileSync(join(state.dir, todayFile()), `${JSON.stringify(entry)}\n`);
  } catch {
    // молча: журнал не важнее работы
  }
};

const emit = (level: LogLevel, module: string, msg: string, data?: LogData): void => {
  if (LEVELS[level] < LEVELS[state.level]) return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...runField(state.run),
    ...dataField(data),
  };

  writeEntry(entry);

  if (state.console) {
    const tag = level.toUpperCase().padEnd(5);
    const extra = dataSuffix(entry.data);
    process.stderr.write(`${entry.ts} ${tag} [${module}] ${msg}${extra}\n`);
  }
};

/** Строка журнала с префиксом-модулем. Один префикс на область работы. */
export const createLogger = (module: string): Logger => ({
  debug: (msg, data?) => emit('debug', module, msg, data),
  info: (msg, data?) => emit('info', module, msg, data),
  warn: (msg, data?) => emit('warn', module, msg, data),
  error: (msg, data?) => emit('error', module, msg, data),
});

/** Урезать длинный текст до одной строки: поля журнала остаются читаемыми. */
export const truncate = (text: string, max = 120): string => {
  const oneLine = text.replace(/\n/g, '\\n');
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
};
