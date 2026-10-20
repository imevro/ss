/**
 * Контракт очереди: имена задач и то, что каждая получает на вход.
 * Одно место, где виден весь список работ.
 */

export type Jobs = {
  'db:provision': { readonly companyId: string };
};

export type JobName = keyof Jobs;
