import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { photosDir, webDist } from './paths';
import { itemRoutes } from './routes/items';
import { publishRoutes } from './routes/publish';
import { settingsRoutes } from './routes/settings';
import { scrapeRoutes } from './routes/scrape';
import { recoverStaleJobs } from './jobs';

const PORT = Number(process.env.PORT ?? 8123);
const HOST = process.env.HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  mkdirSync(photosDir, { recursive: true });

  const recovered = recoverStaleJobs();
  if (recovered > 0) {
    console.log(`Recovered ${recovered} item(s) stuck in publishing from a prior run.`);
  }

  const app = Fastify({
    logger: { transport: { target: 'pino-pretty' } },
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 30 * 1024 * 1024, files: 30 },
  });

  // Serve stored photos at /api/photos/<itemId>/<filename>.
  await app.register(fastifyStatic, {
    root: photosDir,
    prefix: '/api/photos/',
    decorateReply: false,
  });

  // API routes.
  await app.register(itemRoutes, { prefix: '/api' });
  await app.register(publishRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(scrapeRoutes, { prefix: '/api' });

  // In a production-style run (`pnpm build` first), serve the built web UI and
  // fall back to index.html for client-side routes. In dev the UI is served by
  // Vite on :5173 instead.
  const hasWeb = existsSync(join(webDist, 'index.html'));
  if (hasWeb) {
    // wildcard:false registers a route per built file, so unknown paths fall
    // through to the SPA fallback below instead of returning a static 404.
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  await app.listen({ port: PORT, host: HOST });
  const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  if (hasWeb) {
    app.log.info(`sell-your-shit is ready → open ${url}`);
  } else {
    app.log.info(`API ready on ${url}/api — run the web UI with "pnpm dev" (Vite on :5173)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
