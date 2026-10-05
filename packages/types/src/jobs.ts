/**
 * Контракт очереди: имена задач и то, что каждая получает на вход.
 * Одно место, где виден весь список работ.
 */

export type Jobs = {
  'onboarding:proposal': { readonly userId: string; readonly business: string };
  'db:provision': { readonly companyId: string };
};

export type JobName = keyof Jobs;
