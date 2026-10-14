/**
 * Настройки процесса. Читаются один раз при запуске и дальше передаются явно.
 * Обязательная настройка без значения — это отказ запуска, а не тихий запасной путь.
 */

/** Обязательная настройка. Нет значения — падаем на старте, а не посреди работы. */
const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`настройка ${name} не задана`);
  return value;
};

/** Настройка, у которой есть осмысленное значение по умолчанию. */
const optional = (name: string, fallback: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
};

/**
 * Адрес агента. Пустой — агент не подключён, это допустимо. Непустой обязан быть
 * полным адресом с известной схемой: иначе первое же обращение падает внутри
 * незакрытого обещания, и человек не видит ничего.
 */
const agentUrlOf = (value: string): string => {
  if (value === '') return '';
  const ok = ['ws://', 'wss://', 'http://', 'https://'].some((scheme) => value.startsWith(scheme));
  if (!ok) throw new Error(`AGENT_URL без схемы: ${value}`);
  return value;
};

export const config = {
  databaseUrl: required('DATABASE_URL'),
  authSecret: required('BETTER_AUTH_SECRET'),
  authUrl: optional('BETTER_AUTH_URL', 'http://localhost:8787'),
  webOrigins: optional('WEB_ORIGINS', 'http://localhost:5173').split(','),
  port: Number(optional('PORT', '8787')),
  llmBaseUrl: required('LLM_BASE_URL'),
  llmApiKey: required('LLM_API_KEY'),
  llmModel: required('LLM_MODEL'),
  /** Пароль между API и воркером: воркер рассказывает о работе, чужой запрос отбивается. */
  workerToken: optional('WORKER_TOKEN', ''),
  /**
   * Ключ аккаунта Cloudflare и его номер. Ключ наружу не уходит: его подставляет
   * прокси. Пусто — доступ к платформе не настроен, и прокси отвечает отказом.
   */
  cloudflareToken: optional('CLOUDFLARE_API_TOKEN', ''),
  cloudflareAccount: optional('CLOUDFLARE_ACCOUNT_ID', ''),
  /** Адрес агента и общий с ним пароль. Пусто — чат с агентом не отвечает. */
  agentUrl: agentUrlOf(optional('AGENT_URL', '')),
  agentSecret: optional('AGENT_SECRET', ''),
} as const;
