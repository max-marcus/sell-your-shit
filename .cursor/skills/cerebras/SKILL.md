---
name: Cerebras Inference
description: Use this to write TypeScript code for Node.js that calls an LLM through OpenRouter with the Cerebras inference provider, using the official OpenAI SDK
---
# Calling an LLM via Cerebras

These instructions allow you write code to call an LLM with Cerebras specified as the inference provider.  
This method uses the official `openai` Node.js SDK pointed at OpenRouter's OpenAI-compatible API.

## Setup

The OPENROUTER_API_KEY must be set in the repo-root `.env` file (copy `.env.sample`).  
Server entry points load `.env` by importing `apps/server/src/env.ts` first. A new entry point must do the same.  
Make LLM calls only from `apps/server`, never from the web UI.

The workspace package must include openai and zod.
`pnpm --filter <package-name> add openai zod`

## Code snippets

Use code like these examples in order to use Cerebras.

### Imports and constants

```ts
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';

const MODEL = 'openai/gpt-oss-120b';
/** OpenRouter-only fields. Spread into the request; the SDK sends them in the body as-is. */
const EXTRA_BODY = { provider: { order: ['cerebras'] } };

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

### Code to call via Cerebras for a text response

```ts
const response = await client.chat.completions.create({
  model: MODEL,
  messages,
  reasoning_effort: 'low',
  ...EXTRA_BODY,
});
const result = response.choices[0]?.message.content;
```

### Code to call via Cerebras for a Structured Outputs response

```ts
const MySchema = z.object({ title: z.string(), price: z.number() });

const response = await client.chat.completions.parse({
  model: MODEL,
  messages,
  response_format: zodResponseFormat(MySchema, 'my_schema'),
  reasoning_effort: 'low',
  ...EXTRA_BODY,
});
const resultAsObject = response.choices[0]?.message.parsed; // z.infer<typeof MySchema> | null
```
