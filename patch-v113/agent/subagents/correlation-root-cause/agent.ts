import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";
import { z } from "zod";

const model = process.env.DEEPSEEK_API_KEY
  ? deepseek("deepseek-chat")
  : "deepseek/deepseek-v3.2";

const outputSchema = z.object({
  relationship: z.enum([
    "likely_related",
    "possibly_related",
    "insufficient_evidence",
    "likely_unrelated",
  ]),
  candidate_common_causes: z.array(z.string()).max(5),
  supporting_evidence: z.array(z.string()).max(8),
  contradicting_evidence: z.array(z.string()).max(8),
  evidence_gaps: z.array(z.string()).max(8),
  next_best_validation: z.string(),
  recommended_next_stage: z.enum([
    "context_investigation",
    "resolution",
    "verification",
    "escalation",
  ]),
});

export default defineAgent({
  description:
    "Return one terminal structured correlation assessment from a compact AI-NOC timeline/topology envelope. Never request a second specialist turn.",
  model,
  modelContextWindowTokens: 64000,
  outputSchema,
});
