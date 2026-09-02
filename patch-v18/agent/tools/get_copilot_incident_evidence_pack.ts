import { defineTool } from "eve/tools";
import { z } from "zod";
import { audit, DATA_AS_OF } from "../lib/audit";
import { COPILOT_CASES } from "../lib/copilot_cases";

export default defineTool({
  description: "Build one deduplicated, privacy-safe evidence pack for the end-to-end AI-NOC Copilot incident workflow so one model call can investigate, decide whether alarms correlate, rank root-cause hypotheses and recommend troubleshooting without invoking specialist LLMs.",
  inputSchema: z.object({
    tenant_id: z.string().min(1),
    ticket_id: z.string().min(1),
    lookback_days: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(90)
  }),
  async execute(input) {
    const selected = COPILOT_CASES[input.ticket_id];
    if (!selected || selected.tenant_id !== input.tenant_id) {
      return {
        status: "not_found",
        data_as_of: DATA_AS_OF,
        is_live: false,
        source_records: 0,
        warnings: ["No matching demo ticket"]
      };
    }

    // Deliberately keep any privacy-trap fixture server-side. It exists only to prove
    // that raw cross-customer identifiers never enter the model-visible tool result.
    const redactedFields = selected.private_fixture_only ? Object.keys(selected.private_fixture_only).length : 0;
    const alarmCount = selected.alarm_counts[input.lookback_days];
    const localResolutionCount = selected.resolution_evidence.local_history.length;
    const globalResolutionCount = selected.resolution_evidence.global_patterns.sample_count;
    const oemGuidanceCount = selected.resolution_evidence.oem_guidance ? 1 : 0;
    const sequenceCount = selected.correlation.sequence.length;
    const dependencyCount = selected.correlation.dependencies.length;
    const localCorrelationCount = selected.correlation.local_history.comparison_clusters;
    const globalCorrelationCount = selected.correlation.global_patterns.sample_count;
    const rankedCauseCount = selected.correlation.ranked_causes.length;
    const planCount = selected.recommended_plan.length;

    audit("get_incident_context", "tenant", "synthetic_key_stats", 1, { warningCount: 1 });
    audit("get_correlated_incident", "tenant", "synthetic_ticket_correlation", selected.related_events.length);
    audit("get_alarm_history", "tenant", "synthetic_daily_alarm", alarmCount, { warningCount: 1 });
    audit("get_historical_resolutions", "tenant", "synthetic_resolution_history", localResolutionCount);
    audit("get_global_incident_resolution_patterns", "global_anonymized", "synthetic_global_resolution_patterns", globalResolutionCount, { warningCount: 1 });
    audit("get_oem_alarm_guidance", "shared_oem", "synthetic_trap_knowledge", oemGuidanceCount);
    audit("get_temporal_correlation", "tenant", "synthetic_temporal_correlation", sequenceCount, { warningCount: 1 });
    audit("get_dependency_context", "tenant", "synthetic_dependency_context", dependencyCount);
    audit("get_correlation_history", "tenant", "synthetic_correlation_history", localCorrelationCount);
    audit("compare_correlation_patterns_to_global", "global_anonymized", "synthetic_global_correlation_patterns", globalCorrelationCount, { warningCount: 1 });
    audit("rank_root_cause_candidates", "tenant", "synthetic_root_cause_ranking", rankedCauseCount, { warningCount: 1 });
    audit("rank_troubleshooting_plan", "tenant", "synthetic_troubleshooting_plan", planCount, { warningCount: 1 });

    const sourceRecords =
      1 +
      selected.related_events.length +
      alarmCount +
      localResolutionCount +
      globalResolutionCount +
      oemGuidanceCount +
      dependencyCount +
      localCorrelationCount +
      globalCorrelationCount;

    audit("get_copilot_incident_evidence_pack", "tenant", "synthetic_copilot_incident_evidence_pack", sourceRecords, { warningCount: selected.warnings.length, main: true });

    return {
      status: "success",
      data_as_of: DATA_AS_OF,
      is_live: false,
      source_records: sourceRecords,
      warnings: selected.warnings,
      incident: selected.incident,
      correlated_symptoms: selected.related_events,
      alarm_history: {
        lookback_days: input.lookback_days,
        alarm_count: alarmCount
      },
      deterministic_assessment: selected.deterministic_assessment,
      correlation: {
        ...selected.correlation,
        global_patterns: {
          ...selected.correlation.global_patterns,
          privacy: "aggregate_anonymized"
        }
      },
      resolution_evidence: selected.resolution_evidence,
      recommended_plan: selected.recommended_plan,
      escalation: selected.escalation,
      closure_criteria: selected.closure_criteria,
      privacy: {
        tenant_detail: "tenant_scoped",
        global_resolution_evidence: "global_sanitized",
        global_correlation_evidence: "global_sanitized",
        cross_customer_identifiers_exposed: false,
        sanitization_applied: redactedFields > 0,
        redacted_fields_count: redactedFields
      }
    };
  }
});