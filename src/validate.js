'use strict';
/* validate.js — zod schemas (spec §8.4): env config, AI provider responses, ad payloads, targets.
   Validation failures surface as safe errors (no secrets in messages). */
const { z } = require('zod');

/** Targeting schema — mirrors what Telegram Ads API accepts (verified fields only). */
const AdsTargetSchema = z.object({
  type: z.enum(['users', 'channels']),
  topic_ids: z.array(z.number().int()).max(20).optional(),
  language_codes: z.array(z.string().length(2)).max(10).optional(),
  country_codes: z.array(z.string().length(2)).max(30).optional(),
  channel_ids: z.array(z.string().startsWith('@')).max(50).optional()
});

/** Ad creation payload — validated BEFORE hitting the official API (fail fast, spend nothing). */
const CreateAdSchema = z.object({
  title: z.string().min(1).max(60),
  text: z.string().min(1).max(160),
  promote_url: z.string().url(),
  cpm: z.number().positive().max(20),
  placement: z.enum(['channel_post']),
  target: AdsTargetSchema,
  initial_budget: z.number().min(1.8),           // platform-verified minimum
  daily_budget_limit: z.number().min(0.1).optional()
});

/** AI chat response — rejects malformed provider payloads (spec: malformed responses handled). */
const AiResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().min(1)
    }).passthrough()
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().nonnegative().optional(),
    completion_tokens: z.number().nonnegative().optional()
  }).optional()
}).passthrough();

/** Validate + describe errors safely (no input values echoed when they may contain secrets). */
function safeParse(schema, data, label = 'payload') {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, value: r.data };
  const issue = r.error.issues?.[0];
  return { ok: false, error: `${label} invalid at ${issue?.path?.join('.') || 'root'} (${issue?.code || 'schema'})` };
}

module.exports = { AdsTargetSchema, CreateAdSchema, AiResponseSchema, safeParse };
