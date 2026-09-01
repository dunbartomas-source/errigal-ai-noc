import { defineTool } from "eve/tools";
import { z } from "zod";
import { audit, DATA_AS_OF } from "../lib/audit";
import {
  DEMO_TENANT,
  GLOBAL_RESOLUTION_PATTERNS,
  INCIDENT,
  INCIDENT_CHILDREN,
  INCIDENT_CORRELATION,
  LOCAL_RESOLUTIONS,
  OEM_GUIDANCE,
  RESOLUTION_PLAN
} from "../lib/demo";

export default defineTool({
  description: "Build one deduplicated, privacy-safe evidence pack for the end-to-end AI-NOC Copilot incident workflow so one model call can investigate, correlate, rank likely root causes and recommend troubleshooting without invoking specialist LLMs.",
  inputSchema: z.object({
    tenant_id: z.string().min(1),
    ticket_id: z.string().min(1),
    lookback_days: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(90)
  }),
  async execute(input) {
    if (input.tenant_id !== DEMO_TENANT || input.ticket_id !== INCIDENT.ticket_id) {
      return {
        status: "not_found",
        data_as_of: DATA_AS_OF,
        is_live: false,
        source_records: 0,
        warnings: ["No matching demo ticket"]
      };
    }

    const alarmCounts: Record<number, number> = { 30: 3, 60: 5, 90: 7 };
    const alarmCount = alarmCounts[input.lookback_days];
    const localPsuMatches = LOCAL_RESOLUTIONS.filter((row) => row.root_cause === "PSU hardware failure").length;
    const localFeedMatches = LOCAL_RESOLUTIONS.filter((row) => row.root_cause === "Power connection or feed issue").length;
    const globalPsu = GLOBAL_RESOLUTION_PATTERNS.find((row) => row.root_cause === "PSU hardware failure");
    const globalFeed = GLOBAL_RESOLUTION_PATTERNS.find((row) => row.root_cause === "Power connection or feed issue");
    const leadingCause = INCIDENT_CORRELATION.ranked_causes[0];
    const alternativeCause = INCIDENT_CORRELATION.ranked_causes[1];

    // Read each evidence family once. Global evidence is sanitized before model access.
    audit("get_incident_context", "tenant", "synthetic_key_stats", 1, { warningCount: 1 });
    audit("get_correlated_incident", "tenant", "synthetic_ticket_correlation", 3);
    audit("get_alarm_history", "tenant", "synthetic_daily_alarm", alarmCount, { warningCount: 1 });
    audit("get_historical_resolutions", "tenant", "synthetic_resolution_history", LOCAL_RESOLUTIONS.length);
    audit("get_global_incident_resolution_patterns", "global_anonymized", "synthetic_global_resolution_patterns", 52, { warningCount: 1 });
    audit("get_oem_alarm_guidance", "shared_oem", "synthetic_trap_knowledge", 1);
    audit("get_temporal_correlation", "tenant", "synthetic_temporal_correlation", INCIDENT_CORRELATION.sequence.length, { warningCount: 1 });
    audit("get_dependency_context", "tenant", "synthetic_dependency_context", INCIDENT_CORRELATION.dependencies.length);
    audit("get_correlation_history", "tenant", "synthetic_correlation_history", INCIDENT_CORRELATION.local_history.comparison_clusters);
    audit("compare_correlation_patterns_to_global", "global_anonymized", "synthetic_global_correlation_patterns", INCIDENT_CORRELATION.global_patterns.sample_count, { warningCount: 1 });
    audit("rank_root_cause_candidates", "tenant", "synthetic_root_cause_ranking", INCIDENT_CORRELATION.ranked_causes.length, { warningCount: 1 });
    audit("rank_troubleshooting_plan", "tenant", "synthetic_troubleshooting_plan", RESOLUTION_PLAN.length, { warningCount: 1 });

    // Unique raw/aggregate evidence records represented in the pack. Derived rankings/plans are not double-counted.
    const sourceRecords =
      1 +
      3 +
      alarmCount +
      LOCAL_RESOLUTIONS.length +
      52 +
      1 +
      INCIDENT_CORRELATION.dependencies.length +
      INCIDENT_CORRELATION.local_history.comparison_clusters +
      INCIDENT_CORRELATION.global_patterns.sample_count;

    audit("get_copilot_incident_evidence_pack", "tenant", "synthetic_copilot_incident_evidence_pack", sourceRecords, { warningCount: 2, main: true });

    return {
      status: "success",
      data_as_of: DATA_AS_OF,
      is_live: false,
      source_records: sourceRecords,
      warnings: [
        "Synthetic MVP data; stored customer evidence is current only through the previous scheduled refresh",
        "Recommendations only; confirm live state in NOVA/monitoring before any operational action"
      ],
      incident: {
        ticket_id: INCIDENT.ticket_id,
        incident_group_id: INCIDENT.incident_group_id,
        status: INCIDENT.status,
        priority: INCIDENT.priority,
        service_impacting: INCIDENT.service_impacting,
        alarm_identifier: INCIDENT.alarm_identifier,
        trap_name: INCIDENT.trap_name,
        technology: INCIDENT.technology,
        oem: INCIDENT.oem,
        device_model: INCIDENT.device_model,
        software_version: INCIDENT.software_version,
        device_name: INCIDENT.device_name,
        site_name: INCIDENT.site_name
      },
      correlated_symptoms: INCIDENT_CHILDREN,
      alarm_history: {
        lookback_days: input.lookback_days,
        alarm_count: alarmCount
      },
      deterministic_assessment: {
        correlation_required: true,
        likely_common_incident: true,
        leading_hypothesis: leadingCause.hypothesis,
        confidence: leadingCause.confidence,
        score: leadingCause.score,
        strongest_alternative: alternativeCause.hypothesis,
        alternative_score: alternativeCause.score,
        evidence_strength: {
          local_resolution_history: `${localPsuMatches}/${LOCAL_RESOLUTIONS.length} local resolved matches were PSU hardware failures; ${localFeedMatches}/${LOCAL_RESOLUTIONS.length} was a power connection/feed issue`,
          global_resolution_history: `${globalPsu?.count ?? 0}/52 anonymized outcomes were PSU hardware failure/PSU replacement; ${globalFeed?.count ?? 0}/52 were connection/feed issues`,
          local_correlation_history: `${INCIDENT_CORRELATION.local_history.same_power_cascade}/${INCIDENT_CORRELATION.local_history.comparison_clusters} local comparison clusters matched the same power-cascade pattern`,
          global_correlation_history: `${INCIDENT_CORRELATION.global_patterns.common_power_fault}/${INCIDENT_CORRELATION.global_patterns.sample_count} anonymized correlation clusters supported a common power fault; ${INCIDENT_CORRELATION.global_patterns.connection_or_feed_issue}/${INCIDENT_CORRELATION.global_patterns.sample_count} supported a connection/feed issue`
        },
        confirmed_root_cause: false
      },
      correlation: {
        sequence: INCIDENT_CORRELATION.sequence,
        dependencies: INCIDENT_CORRELATION.dependencies,
        local_history: INCIDENT_CORRELATION.local_history,
        global_patterns: {
          ...INCIDENT_CORRELATION.global_patterns,
          privacy: "aggregate_anonymized"
        },
        ranked_causes: INCIDENT_CORRELATION.ranked_causes
      },
      resolution_evidence: {
        local_history: LOCAL_RESOLUTIONS,
        global_patterns: {
          sample_count: 52,
          privacy: "aggregate_anonymized",
          patterns: GLOBAL_RESOLUTION_PATTERNS
        },
        oem_guidance: OEM_GUIDANCE
      },
      recommended_plan: RESOLUTION_PLAN,
      escalation: {
        field_engineer: "Required for physical power/connection checks and confirmed PSU replacement",
        oem: "Escalate to Corning if PWR-FAIL persists after verified power, connection and hardware checks or diagnostics conflict"
      },
      closure_criteria: [
        "PWR-FAIL is clear in live monitoring",
        "COMM-LOSS and UNIT-OFFLINE recover or are separately explained",
        "Service is restored",
        "Root cause and action taken are captured in the ticket workflow",
        "Recurrence is monitored"
      ],
      privacy: {
        tenant_detail: "tenant_scoped",
        global_resolution_evidence: "global_sanitized",
        global_correlation_evidence: "global_sanitized",
        cross_customer_identifiers_exposed: false
      }
    };
  }
});
