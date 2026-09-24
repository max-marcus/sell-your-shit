import type { FastifyInstance } from 'fastify';
import { scrapeRetailSchema } from '@sell/core';
import { scrapeRetailProduct } from '../retail-scrape';

export async function scrapeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/scrape-retail', async (req, reply) => {
    const parsed = scrapeRetailSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid URL', details: parsed.error.issues });
    }

    try {
      const result = await scrapeRetailProduct(parsed.data.url);
      if (!result.title && result.retailPriceCents == null) {
        return reply.code(422).send({
          error:
            'Could not extract product details from that page. Try a direct product URL, or fill the form manually.',
          result,
        });
      }
      return result;
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: `Failed to fetch retail page: ${(err as Error).message}`,
      });
    }
  });
}
