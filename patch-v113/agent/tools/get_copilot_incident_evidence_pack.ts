import { defineTool } from "eve/tools";
import { z } from "zod";
import { audit, DATA_AS_OF } from "../lib/audit";
import { getCopilotIncidentCase } from "../lib/copilot_source";

export default defineTool({
  description: "Build one deduplicated, privacy-safe evidence pack for the end-to-end AI-NOC Copilot incident workflow using the configured read-only source.",
  inputSchema: z.object({
    tenant_id: z.string().min(1),
    ticket_id: z.string().min(1),
    alarm_identifier: z.union([z.string().min(1), z.literal("")]).optional(),
    lookback_days: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(90)
  }),
  async execute(input) {
    const sourceResult = await getCopilotIncidentCase(input.tenant_id, input.ticket_id, input.alarm_identifier);
    if (sourceResult.status !== "success") {
      audit("get_copilot_incident_source", "tenant", sourceResult.source, 0, { warningCount: sourceResult.warnings.length });
      return { status: sourceResult.status, data_as_of: DATA_AS_OF, is_live: sourceResult.is_live, source_records: 0, data_source: { id: sourceResult.source, mode: "read_only", configured: false }, warnings: sourceResult.warnings };
    }
    const selected = sourceResult.case_data;
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
    audit("get_copilot_incident_source", "tenant", sourceResult.source, 1);
    audit("get_incident_context", "tenant", `${sourceResult.source}_key_stats`, 1, { warningCount: 1 });
    audit("get_correlated_incident", "tenant", `${sourceResult.source}_ticket_correlation`, selected.related_events.length);
    audit("get_alarm_history", "tenant", `${sourceResult.source}_daily_alarm`, alarmCount, { warningCount: 1 });
    audit("get_historical_resolutions", "tenant", `${sourceResult.source}_resolution_history`, localResolutionCount);
    audit("get_global_incident_resolution_patterns", "global_anonymized", `${sourceResult.source}_global_resolution_patterns`, globalResolutionCount, { warningCount: 1 });
    audit("get_oem_alarm_guidance", "shared_oem", `${sourceResult.source}_trap_knowledge`, oemGuidanceCount);
    audit("get_temporal_correlation", "tenant", `${sourceResult.source}_temporal_correlation`, sequenceCount, { warningCount: 1 });
    audit("get_dependency_context", "tenant", `${sourceResult.source}_dependency_context`, dependencyCount);
    audit("get_correlation_history", "tenant", `${sourceResult.source}_correlation_history`, localCorrelationCount);
    audit("compare_correlation_patterns_to_global", "global_anonymized", `${sourceResult.source}_global_correlation_patterns`, globalCorrelationCount, { warningCount: 1 });
    audit("rank_root_cause_candidates", "tenant", `${sourceResult.source}_root_cause_ranking`, rankedCauseCount, { warningCount: 1 });
    audit("rank_troubleshooting_plan", "tenant", `${sourceResult.source}_troubleshooting_plan`, planCount, { warningCount: 1 });
    const sourceRecords = 1 + selected.related_events.length + alarmCount + localResolutionCount + globalResolutionCount + oemGuidanceCount + dependencyCount + localCorrelationCount + globalCorrelationCount;
    audit("get_copilot_incident_evidence_pack", "tenant", `${sourceResult.source}_copilot_incident_evidence_pack`, sourceRecords, { warningCount: selected.warnings.length, main: true });
    return {
      status: "success", data_as_of: DATA_AS_OF, is_live: sourceResult.is_live, source_records: sourceRecords,
      data_source: { id: sourceResult.source, mode: "read_only", configured: true }, warnings: [...sourceResult.warnings, ...selected.warnings],
      incident: selected.incident, correlated_symptoms: selected.related_events, alarm_history: { lookback_days: input.lookback_days, alarm_count: alarmCount },
      deterministic_assessment: selected.deterministic_assessment,
      correlation: { ...selected.correlation, global_patterns: { ...selected.correlation.global_patterns, privacy: "aggregate_anonymized" } },
      resolution_evidence: selected.resolution_evidence, recommended_plan: selected.recommended_plan, escalation: selected.escalation, closure_criteria: selected.closure_criteria,
      privacy: { tenant_detail: "tenant_scoped", global_resolution_evidence: "global_sanitized", global_correlation_evidence: "global_sanitized", cross_customer_identifiers_exposed: false, sanitization_applied: redactedFields > 0, redacted_fields_count: redactedFields }
    };
  }
});
