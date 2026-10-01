import type { FastifyInstance } from 'fastify';
import { assistRequestSchema, type AssistStatusResponse } from '@sell/core';
import { getAssistProfile } from '../assist/registry';
import { runAssistTurn } from '../assist/service';
import { LlmError, type LlmClient } from '../llm/types';

/** Options for `assistRoutes`. */
export interface AssistRoutesOptions {
  /** LLM client, or null when no API key is configured. */
  llm: LlmClient | null;
}

const NOT_CONFIGURED = 'AI assist is not configured. Set OPENROUTER_API_KEY in .env and restart the server.';

/** Generic AI assist routes. Page-specific behavior lives in assist profiles. */
export async function assistRoutes(app: FastifyInstance, opts: AssistRoutesOptions): Promise<void> {
  const { llm } = opts;

  app.get('/assist/status', async (): Promise<AssistStatusResponse> => ({ configured: llm !== null }));

  app.post<{ Params: { profile: string } }>('/assist/:profile', async (req, reply) => {
    const profile = getAssistProfile(req.params.profile);
    if (!profile) {
      return reply.code(404).send({ error: `Unknown assist profile "${req.params.profile}"` });
    }
    if (!llm) return reply.code(503).send({ error: NOT_CONFIGURED });

    const body = assistRequestSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid assist request', details: body.error.issues });
    }
    const context = profile.contextSchema.safeParse(body.data.context);
    if (!context.success) {
      return reply.code(400).send({ error: 'Invalid assist context', details: context.error.issues });
    }

    try {
      return await runAssistTurn(llm, profile, body.data.messages, context.data);
    } catch (err) {
      if (!(err instanceof LlmError)) throw err;
      req.log.error({ profile: profile.name, message: err.message }, 'assist turn failed');
      return reply.code(502).send({ error: err.message });
    }
  });
}
