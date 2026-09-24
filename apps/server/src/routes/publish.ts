import type { FastifyInstance } from 'fastify';
import { PLATFORM_LABELS, publishRequestSchema, type JobState, type Platform } from '@sell/core';
import { getItem } from '../repo';
import { jobManager } from '../jobs';

/** Platforms that support browser-based publish jobs (OfferUp is manual URL only). */
const AUTOMATED_PLATFORMS = new Set<Platform>(['craigslist', 'facebook']);

interface IdParams {
  id: string;
}

export async function publishRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: IdParams }>('/items/:id/publish', async (req, reply) => {
    const item = getItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'Item not found' });

    const parsed = publishRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }

    const blocked: string[] = [];
    const platforms: Platform[] = [];
    for (const platform of parsed.data.platforms) {
      if (!AUTOMATED_PLATFORMS.has(platform)) {
        blocked.push(`${PLATFORM_LABELS[platform]} does not support automated publishing`);
        continue;
      }
      const existing = item.listings.find((l) => l.platform === platform);
      if (existing?.url) {
        blocked.push(`${PLATFORM_LABELS[platform]} already has a listing link`);
        continue;
      }
      platforms.push(platform);
    }

    if (platforms.length === 0) {
      return reply.code(400).send({
        error: blocked.length > 0 ? blocked.join('. ') : 'Pick at least one platform.',
      });
    }

    const job = jobManager.enqueue(item, platforms);
    return reply.code(202).send(job);
  });

  app.get<{ Params: IdParams }>('/jobs/:id', async (req, reply) => {
    const job = jobManager.get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return job;
  });

  // Server-Sent Events stream of job state updates (live publish log).
  app.get<{ Params: IdParams }>('/jobs/:id/events', (req, reply) => {
    const id = req.params.id;
    const job = jobManager.get(id);
    if (!job) {
      reply.code(404).send({ error: 'Job not found' });
      return;
    }

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (state: JobState) => {
      raw.write(`data: ${JSON.stringify(state)}\n\n`);
    };
    send(job);

    const unsubscribe = jobManager.subscribe(id, send);
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), 25000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
