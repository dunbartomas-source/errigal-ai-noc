import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";
import { z } from "zod";

const model = process.env.DEEPSEEK_API_KEY
  ? deepseek("deepseek-chat")
  : "deepseek/deepseek-v3.2";

const patternSchema = z.object({
  action: z.string(),
  support_count: z.number().int().nonnegative(),
  already_tried_match: z.boolean(),
});

const outputSchema = z.object({
  historical_match_summary: z.string(),
  ranked_patterns: z.array(patternSchema).max(6),
  recommended_next_action: z.string(),
  why_this_action: z.string(),
  expected_observation: z.string(),
  stop_condition: z.string(),
  evidence_gaps: z.array(z.string()).max(8),
});

export default defineAgent({
  description:
    "Return one terminal structured historical-resolution recommendation after searching sanitized resolved incidents. Deprioritize already-tried actions and never treat similarity as proof.",
  model,
  modelContextWindowTokens: 64000,
  outputSchema,
});
