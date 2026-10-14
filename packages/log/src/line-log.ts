/**
 * Строчный журнал: уровни, префикс-модуль, поля данных. Пишет строку JSON в файл
 * за сегодня и, если включено, дублирует в stderr.
 *
 * Состояние одно на процесс и задаётся при запуске. Настройки журнала читает
 * запуск приложения, а не этот модуль: тут только значения по умолчанию.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

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
const state: { dir?: string; dirReady: boolean; level: LogLevel; console: boolean; run?: string; warned: boolean } = {
  level: 'info',
  console: true,
  dirReady: false,
  warned: false,
};

export const configureLogger = (options: LoggerOptions): void => {
  if (options.dir !== undefined && options.dir !== state.dir) {
    state.dir = options.dir;
    state.dirReady = false;
    state.warned = false;
  }
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

const LEVELS_LIST: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Уровень из настройки: чужое имя — отказ запуска, а не тихий запасной путь. */
const levelOf = (value: string): LogLevel => {
  const found = LEVELS_LIST.find((level) => level === value);
  if (found === undefined) throw new Error(`LOG_LEVEL=${value} не понимаю`);
  return found;
};

/** Значение настройки журнала: пустое или отсутствующее — значение по умолчанию. */
const envValue = (name: string, fallback: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
};

/**
 * Настройка журнала из среды. Читается один раз при запуске — дальше модули о среде
 * не знают. Журнал знает только про себя: настройки приложения (база, ключи) живут
 * в `env.ts` приложения.
 */
export const setupLogging = (): void => {
  configureLogger({
    level: levelOf(envValue('LOG_LEVEL', 'info')),
    console: envValue('LOG_CONSOLE', 'true') === 'true',
    ...dirOption(process.env.LOG_DIR),
  });
};

/**
 * Запись в файл не должна ронять работу: любая беда с диском остаётся бедой диска.
 * Каталог заводим один раз — за жизнь процесса он не меняется. Имя файла берём из
 * самой записи: её время уже посчитано, второй раз его считать нечего.
 *
 * Молчать об отказе тоже нельзя: потерянный журнал тогда выглядит как тишина, а не
 * как поломка. Говорим в stderr — один раз на каталог, чтобы не залить поток.
 */
const writeEntry = (entry: LogEntry): void => {
  if (state.dir === undefined) return;
  try {
    if (!state.dirReady) {
      mkdirSync(state.dir, { recursive: true });
      state.dirReady = true;
    }
    appendFileSync(join(state.dir, `${entry.ts.slice(0, 10)}.jsonl`), `${JSON.stringify(entry)}\n`);
  } catch (error) {
    if (state.warned) return;
    state.warned = true;
    process.stderr.write(`журнал в ${state.dir} не пишется: ${String(error)}\n`);
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
