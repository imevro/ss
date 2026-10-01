/**
 * Воркер очереди. Один процесс, одна очередь, разные имена задач.
 * Брокер bunqueue живёт отдельным процессом — его не перезапускает релиз приложения.
 */
import { Worker } from 'bunqueue/client'

export type JobName = 'msg.ingest' | 'db.provision' | 'app.build'

const connection = {
  host: process.env.BUNQUEUE_HOST ?? '127.0.0.1',
  port: Number(process.env.BUNQUEUE_PORT ?? 6789),
}

const handlers: Record<JobName, (data: unknown) => Promise<unknown>> = {
  'msg.ingest': async (data) => ({ ingested: data }),
  'db.provision': async (data) => ({ provisioned: data }),
  'app.build': async (data) => ({ built: data }),
}

const nameOf = (value: unknown): JobName | undefined => {
  if (typeof value !== 'string') return undefined
  if (value === 'msg.ingest') return 'msg.ingest'
  if (value === 'db.provision') return 'db.provision'
  if (value === 'app.build') return 'app.build'
  return undefined
}

const worker = new Worker(
  'ss',
  async (job) => {
    const name = nameOf(job.name)
    if (name === undefined) return { skipped: job.name }
    return handlers[name](job.data)
  },
  { connection, concurrency: 4 },
)

worker.on('completed', (job) => console.log('[worker] готово:', job.name))
worker.on('failed', (job, error) => console.log('[worker] ошибка:', job.name, String(error)))

console.log('[worker] жду задачи из очереди ss')
