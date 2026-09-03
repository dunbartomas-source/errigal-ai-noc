import { z } from "zod";
import { defineTool } from "eve/tools";
import { searchResolutionHistory } from "../../../lib/resolution_history_source";
import { recordToolAudit } from "../../../lib/tool_audit";

export default defineTool({
  description:
    "Retrieve anonymized historical resolution evidence for an alarm identifier. Returns aggregate fleet patterns and sanitized technical examples only; never returns cross-customer ticket IDs or identifying customer/site/device details. Marks actions that resemble actions already attempted unsuccessfully.",
  inputSchema: z
    .object({
      alarm_identifier: z.string().min(1),
      tenant_id: z.string().min(1).optional(),
      ticket_id: z.string().min(1).optional(),
      network_identifier: z.string().min(1).optional(),
      already_tried_actions: z.array(z.string()).optional(),
      investigation_id: z.string().startsWith("inv-").max(80).optional(),
    })
    .strict(),
  execute: async ({ investigation_id, ...input }) => {
    const startedAt = Date.now();
    const output = await searchResolutionHistory(input);
    recordToolAudit({
      actor: "resolution-intelligence",
      tool: "search_resolution_history",
      status: output.status,
      started_at_ms: startedAt,
      safe_row_count: output.comparable_case_count ?? 0,
      source_class: "historical_resolution",
      freshness: "approved_resolution_table_current_snapshot",
      privacy_state: output.privacy,
      investigation_id: investigation_id ?? null,
      stage: "resolution",
    });
    return output;
  },
  toModelOutput(output: any) {
    return {
      type: "json" as const,
      value: {
        status: output.status,
        privacy: output.privacy,
        alarm_identifier: output.alarm_identifier,
        source: output.source,
        comparable_case_count: output.comparable_case_count ?? 0,
        global_sample_count: output.global_sample_count ?? 0,
        patterns: Array.isArray(output.patterns) ? output.patterns.slice(0, 6) : [],
        anonymized_examples: Array.isArray(output.anonymized_examples)
          ? output.anonymized_examples.slice(0, 5).map((item: any) => ({
              root_cause: String(item.root_cause ?? "").slice(0, 240),
              action: String(item.action ?? "").slice(0, 300),
              outcome: String(item.outcome ?? "").slice(0, 200),
              technology_type: String(item.technology_type ?? "").slice(0, 120),
              sanitized_note: item.sanitized_note
                ? String(item.sanitized_note).slice(0, 300)
                : null,
              note_privacy_status: item.note_privacy_status,
              already_tried_match: item.already_tried_match,
            }))
          : [],
        already_tried_actions: Array.isArray(output.already_tried_actions)
          ? output.already_tried_actions.slice(0, 10)
          : [],
        warnings: Array.isArray(output.warnings) ? output.warnings.slice(-3) : [],
      },
    };
  },
});
