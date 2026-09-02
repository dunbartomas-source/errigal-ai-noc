import {
  DEMO_TENANT,
  GLOBAL_RESOLUTION_PATTERNS,
  INCIDENT,
  INCIDENT_CHILDREN,
  INCIDENT_CORRELATION,
  LOCAL_RESOLUTIONS,
  OEM_GUIDANCE,
  RESOLUTION_PLAN
} from "./demo";

type Confidence = "high" | "medium" | "low";
type CorrelationDecision = "common_cause_supported" | "separate_incidents" | "uncertain" | "not_required";

type RankedCause = {
  hypothesis: string;
  confidence: Confidence | string;
  score: number;
  evidence?: string[];
};

type ResolutionPattern = {
  root_cause: string;
  count: number;
  common_action?: string;
  success_rate?: number;
};

type LocalResolution = {
  ticket_id: string;
  alarm_identifier?: string;
  root_cause: string;
  action_taken: string;
  resolution_outcome: string;
  resolution_minutes: number;
};

type CopilotCase = {
  tenant_id: string;
  incident: Record<string, unknown>;
  related_events: Array<Record<string, unknown>>;
  alarm_counts: Record<30 | 60 | 90, number>;
  deterministic_assessment: {
    correlation_required: boolean;
    likely_common_incident: boolean;
    correlation_decision: CorrelationDecision;
    leading_hypothesis: string;
    confidence: Confidence;
    score: number;
    strongest_alternative: string;
    alternative_score: number;
    evidence_strength: Record<string, string>;
    confirmed_root_cause: false;
  };
  correlation: {
    sequence: Array<Record<string, unknown>>;
    dependencies: Array<Record<string, unknown>>;
    local_history: Record<string, unknown> & { comparison_clusters: number };
    global_patterns: Record<string, unknown> & { sample_count: number };
    ranked_causes: RankedCause[];
  };
  resolution_evidence: {
    local_history: LocalResolution[];
    global_patterns: {
      sample_count: number;
      privacy: "aggregate_anonymized";
      patterns: ResolutionPattern[];
    };
    oem_guidance: Record<string, unknown> | null;
  };
  recommended_plan: Array<Record<string, unknown>>;
  escalation: {
    field_engineer: string;
    oem: string;
  };
  closure_criteria: string[];
  warnings: string[];
  private_fixture_only?: Record<string, string>;
};

const baseWarnings = [
  "Synthetic MVP data; stored customer evidence is current only through the previous scheduled refresh",
  "Recommendations only; confirm live state in NOVA/monitoring before any operational action"
];

export const COPILOT_CASES: Record<string, CopilotCase> = {
  "A-2000": {
    tenant_id: DEMO_TENANT,
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
    related_events: INCIDENT_CHILDREN,
    alarm_counts: { 30: 3, 60: 5, 90: 7 },
    deterministic_assessment: {
      correlation_required: true,
      likely_common_incident: true,
      correlation_decision: "common_cause_supported",
      leading_hypothesis: INCIDENT_CORRELATION.ranked_causes[0].hypothesis,
      confidence: "high",
      score: INCIDENT_CORRELATION.ranked_causes[0].score,
      strongest_alternative: INCIDENT_CORRELATION.ranked_causes[1].hypothesis,
      alternative_score: INCIDENT_CORRELATION.ranked_causes[1].score,
      evidence_strength: {
        local_resolution_history: "2/3 local resolved matches were PSU hardware failures; 1/3 was a power connection/feed issue",
        global_resolution_history: "31/52 anonymized outcomes were PSU hardware failure/PSU replacement; 12/52 were connection/feed issues",
        local_correlation_history: `${INCIDENT_CORRELATION.local_history.same_power_cascade}/${INCIDENT_CORRELATION.local_history.comparison_clusters} local comparison clusters matched the same power-cascade pattern`,
        global_correlation_history: `${INCIDENT_CORRELATION.global_patterns.common_power_fault}/${INCIDENT_CORRELATION.global_patterns.sample_count} anonymized correlation clusters supported a common power fault`
      },
      confirmed_root_cause: false
    },
    correlation: {
      sequence: INCIDENT_CORRELATION.sequence,
      dependencies: INCIDENT_CORRELATION.dependencies,
      local_history: INCIDENT_CORRELATION.local_history,
      global_patterns: INCIDENT_CORRELATION.global_patterns,
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
    warnings: baseWarnings
  },

  "A-2201": {
    tenant_id: DEMO_TENANT,
    incident: {
      ticket_id: "A-2201",
      incident_group_id: "IG-A-2201",
      status: "Under Investigation",
      priority: "P1",
      service_impacting: true,
      alarm_identifier: "PWR-FAIL",
      trap_name: "Power Input Failure",
      technology: "DAS",
      oem: "Corning",
      device_model: "ONE-1000",
      software_version: "5.3.1",
      device_name: "CORNING-ONE-A02",
      site_name: "Customer A Core Site East"
    },
    related_events: [
      { ticket_id: "A-2201", alarm_identifier: "PWR-FAIL", offset_seconds: 0 },
      { ticket_id: "A-2201-C1", alarm_identifier: "INPUT-VOLT-LOW", offset_seconds: 12 },
      { ticket_id: "A-2201-C2", alarm_identifier: "COMM-LOSS", offset_seconds: 41 }
    ],
    alarm_counts: { 30: 4, 60: 7, 90: 9 },
    deterministic_assessment: {
      correlation_required: true,
      likely_common_incident: true,
      correlation_decision: "common_cause_supported",
      leading_hypothesis: "Upstream power feed or loose power connection",
      confidence: "high",
      score: 0.89,
      strongest_alternative: "PSU hardware failure",
      alternative_score: 0.58,
      evidence_strength: {
        local_resolution_history: "3/4 local matches were corrected at the feed, breaker, terminal or power connector",
        global_resolution_history: "29/44 anonymized comparable outcomes were upstream feed/connection faults; 9/44 were PSU failures",
        local_correlation_history: "5/6 local clusters showed low-input-voltage before communication loss",
        global_correlation_history: "61/78 anonymized clusters supported an upstream feed/connection sequence"
      },
      confirmed_root_cause: false
    },
    correlation: {
      sequence: [
        { offset_seconds: 0, alarm_identifier: "PWR-FAIL" },
        { offset_seconds: 12, alarm_identifier: "INPUT-VOLT-LOW" },
        { offset_seconds: 41, alarm_identifier: "COMM-LOSS" }
      ],
      dependencies: [
        { parent: "AC_FEED", child: "POWER_INPUT" },
        { parent: "POWER_INPUT", child: "CONTROLLER" }
      ],
      local_history: { comparison_clusters: 6, same_feed_cascade: 5, psu_failure: 1 },
      global_patterns: { sample_count: 78, feed_or_connection: 61, psu_failure: 11, other: 6 },
      ranked_causes: [
        { hypothesis: "Upstream power feed or loose power connection", confidence: "high", score: 0.89, evidence: ["low-input-voltage preceded communication loss", "local and global feed-fault history"] },
        { hypothesis: "PSU hardware failure", confidence: "medium", score: 0.58, evidence: ["same primary alarm but weaker sequence match"] },
        { hypothesis: "Controller software fault", confidence: "low", score: 0.16, evidence: ["no supporting software symptoms"] }
      ]
    },
    resolution_evidence: {
      local_history: [
        { ticket_id: "A-1781", alarm_identifier: "PWR-FAIL", root_cause: "Loose power terminal", action_taken: "Reseated and torqued power terminal", resolution_outcome: "Resolved", resolution_minutes: 28 },
        { ticket_id: "A-1816", alarm_identifier: "PWR-FAIL", root_cause: "Upstream breaker/feed issue", action_taken: "Restored upstream feed", resolution_outcome: "Resolved", resolution_minutes: 37 },
        { ticket_id: "A-1993", alarm_identifier: "PWR-FAIL", root_cause: "Damaged DC lead", action_taken: "Replaced DC lead", resolution_outcome: "Resolved", resolution_minutes: 42 },
        { ticket_id: "A-2032", alarm_identifier: "PWR-FAIL", root_cause: "PSU hardware failure", action_taken: "Replaced PSU", resolution_outcome: "Resolved", resolution_minutes: 104 }
      ],
      global_patterns: {
        sample_count: 44,
        privacy: "aggregate_anonymized",
        patterns: [
          { root_cause: "Upstream power feed or connection issue", count: 29, common_action: "Validate breaker/feed/terminal and correct connection", success_rate: 0.93 },
          { root_cause: "PSU hardware failure", count: 9, common_action: "Replace PSU after input validation", success_rate: 0.89 },
          { root_cause: "Other", count: 6, common_action: "Further diagnosis" }
        ]
      },
      oem_guidance: {
        alarm_identifier: "PWR-FAIL",
        guidance: "Verify input voltage and power connections before replacing the PSU."
      }
    },
    recommended_plan: [
      { step: 1, action: "Confirm current input voltage and upstream breaker/feed state", reason: "Sequence points upstream of the PSU" },
      { step: 2, action: "Inspect and reseat power terminals/connectors if safe and authorized", reason: "Connection faults dominate comparable resolutions" },
      { step: 3, action: "Only then test or replace PSU if input/feed is verified healthy", reason: "PSU remains a secondary hypothesis" },
      { step: 4, action: "Verify COMM-LOSS clears after stable power is restored", reason: "Downstream symptom should recover if common cause is correct" }
    ],
    escalation: {
      field_engineer: "Required when physical feed, breaker, terminal or cable inspection is needed",
      oem: "Escalate if verified healthy input still produces PWR-FAIL or PSU diagnostics conflict"
    },
    closure_criteria: ["Stable input voltage", "PWR-FAIL clear", "COMM-LOSS recovered", "Root cause documented"],
    warnings: baseWarnings
  },

  "A-2202": {
    tenant_id: DEMO_TENANT,
    incident: {
      ticket_id: "A-2202",
      incident_group_id: "IG-A-2202",
      status: "Open",
      priority: "P2",
      service_impacting: true,
      alarm_identifier: "COMM-LOSS",
      trap_name: "Remote Unit Communication Lost",
      technology: "DAS",
      oem: "Corning",
      device_model: "ONE-1000",
      software_version: "5.3.1",
      device_name: "RU-A-17",
      site_name: "Customer A Distribution Site North"
    },
    related_events: [
      { ticket_id: "A-2202", alarm_identifier: "COMM-LOSS", offset_seconds: 0 },
      { ticket_id: "A-2202-C1", alarm_identifier: "LINK-FLAP", offset_seconds: -22 }
    ],
    alarm_counts: { 30: 8, 60: 13, 90: 18 },
    deterministic_assessment: {
      correlation_required: false,
      likely_common_incident: true,
      correlation_decision: "not_required",
      leading_hypothesis: "Local physical or Ethernet path instability between controller and remote unit",
      confidence: "high",
      score: 0.86,
      strongest_alternative: "Remote unit controller failure",
      alternative_score: 0.43,
      evidence_strength: {
        local_resolution_history: "4/5 local COMM-LOSS matches were cable, connector or switch-port issues",
        global_resolution_history: "38/55 anonymized comparable outcomes were physical/link-path faults",
        local_correlation_history: "LINK-FLAP immediately preceded COMM-LOSS",
        global_correlation_history: "No broader power or multi-device cascade pattern"
      },
      confirmed_root_cause: false
    },
    correlation: {
      sequence: [
        { offset_seconds: -22, alarm_identifier: "LINK-FLAP" },
        { offset_seconds: 0, alarm_identifier: "COMM-LOSS" }
      ],
      dependencies: [{ parent: "SWITCH_PORT_17", child: "RU_A_17" }],
      local_history: { comparison_clusters: 5, physical_link_issue: 4, controller_failure: 1 },
      global_patterns: { sample_count: 55, physical_link_issue: 38, controller_failure: 9, other: 8 },
      ranked_causes: [
        { hypothesis: "Local physical or Ethernet path instability between controller and remote unit", confidence: "high", score: 0.86, evidence: ["link flap before comm loss", "strong local/global cable-port history"] },
        { hypothesis: "Remote unit controller failure", confidence: "medium", score: 0.43, evidence: ["possible if link remains healthy"] },
        { hypothesis: "Power failure", confidence: "low", score: 0.11, evidence: ["no power alarms or multi-device cascade"] }
      ]
    },
    resolution_evidence: {
      local_history: [
        { ticket_id: "A-1732", alarm_identifier: "COMM-LOSS", root_cause: "Damaged Ethernet patch lead", action_taken: "Replaced patch lead", resolution_outcome: "Resolved", resolution_minutes: 24 },
        { ticket_id: "A-1838", alarm_identifier: "COMM-LOSS", root_cause: "Loose RJ45 connection", action_taken: "Reseated connection", resolution_outcome: "Resolved", resolution_minutes: 18 },
        { ticket_id: "A-1904", alarm_identifier: "COMM-LOSS", root_cause: "Switch port fault", action_taken: "Moved to verified port", resolution_outcome: "Resolved", resolution_minutes: 31 },
        { ticket_id: "A-2071", alarm_identifier: "COMM-LOSS", root_cause: "Damaged fibre jumper", action_taken: "Replaced jumper", resolution_outcome: "Resolved", resolution_minutes: 47 },
        { ticket_id: "A-2090", alarm_identifier: "COMM-LOSS", root_cause: "Remote unit controller failure", action_taken: "Replaced controller", resolution_outcome: "Resolved", resolution_minutes: 116 }
      ],
      global_patterns: {
        sample_count: 55,
        privacy: "aggregate_anonymized",
        patterns: [
          { root_cause: "Physical/link path issue", count: 38, common_action: "Validate cable, connector, optics and switch port", success_rate: 0.95 },
          { root_cause: "Controller failure", count: 9, common_action: "Replace controller after link validation", success_rate: 0.88 },
          { root_cause: "Other", count: 8, common_action: "Further diagnosis" }
        ]
      },
      oem_guidance: {
        alarm_identifier: "COMM-LOSS",
        guidance: "Confirm link state, cabling/optics and upstream port before controller replacement."
      }
    },
    recommended_plan: [
      { step: 1, action: "Check live port/link state and recent interface flaps", reason: "Direct evidence points to path instability" },
      { step: 2, action: "Validate cable, connectors and optics", reason: "Most comparable resolutions were physical path faults" },
      { step: 3, action: "Test or move the upstream switch port if authorized", reason: "Port faults are a known local pattern" },
      { step: 4, action: "Consider remote controller replacement only after link path is verified", reason: "Controller failure is secondary" }
    ],
    escalation: {
      field_engineer: "Required if physical cabling, optics or local port access is needed",
      oem: "Escalate if the physical/link path is verified healthy but COMM-LOSS persists"
    },
    closure_criteria: ["Stable link", "COMM-LOSS clear", "No repeated flaps during observation", "Root cause documented"],
    warnings: baseWarnings
  },

  "A-2203": {
    tenant_id: DEMO_TENANT,
    incident: {
      ticket_id: "A-2203",
      incident_group_id: "IG-A-2203",
      status: "Under Investigation",
      priority: "P2",
      service_impacting: false,
      alarm_identifier: "PERF-DEGRADE",
      trap_name: "Performance Degradation",
      technology: "DAS",
      oem: "Generic OEM",
      device_model: "RAN-NODE-X",
      software_version: "2.1.4",
      device_name: "NODE-A-33",
      site_name: "Customer A Venue Site"
    },
    related_events: [
      { ticket_id: "A-2203", alarm_identifier: "PERF-DEGRADE", offset_seconds: 0 },
      { ticket_id: "A-2203-C1", alarm_identifier: "TEMP-WARN", offset_seconds: 390 }
    ],
    alarm_counts: { 30: 1, 60: 2, 90: 2 },
    deterministic_assessment: {
      correlation_required: true,
      likely_common_incident: false,
      correlation_decision: "uncertain",
      leading_hypothesis: "Insufficient evidence to rank a root cause reliably",
      confidence: "low",
      score: 0.34,
      strongest_alternative: "Intermittent RF/environmental degradation",
      alternative_score: 0.31,
      evidence_strength: {
        local_resolution_history: "No close local resolved matches",
        global_resolution_history: "12 anonymized cases split across several unrelated causes",
        local_correlation_history: "Temperature warning occurred too late to establish causality",
        global_correlation_history: "No dominant common pattern"
      },
      confirmed_root_cause: false
    },
    correlation: {
      sequence: [
        { offset_seconds: 0, alarm_identifier: "PERF-DEGRADE" },
        { offset_seconds: 390, alarm_identifier: "TEMP-WARN" }
      ],
      dependencies: [{ parent: "RF_PATH", child: "PERFORMANCE_METRICS" }],
      local_history: { comparison_clusters: 1, similar_pattern: 0 },
      global_patterns: { sample_count: 12, rf_environment: 4, thermal: 3, software: 2, unknown: 3 },
      ranked_causes: [
        { hypothesis: "Insufficient evidence to rank a root cause reliably", confidence: "low", score: 0.34, evidence: ["sparse history", "non-dominant global outcomes"] },
        { hypothesis: "Intermittent RF/environmental degradation", confidence: "low", score: 0.31, evidence: ["one possible pattern but not dominant"] },
        { hypothesis: "Thermal contribution", confidence: "low", score: 0.27, evidence: ["temperature warning follows rather than precedes degradation"] }
      ]
    },
    resolution_evidence: {
      local_history: [],
      global_patterns: {
        sample_count: 12,
        privacy: "aggregate_anonymized",
        patterns: [
          { root_cause: "RF/environmental", count: 4, common_action: "Collect live RF evidence" },
          { root_cause: "Thermal", count: 3, common_action: "Validate temperature trend and cooling" },
          { root_cause: "Software", count: 2, common_action: "Validate software symptoms/version" },
          { root_cause: "Unknown", count: 3, common_action: "Gather more evidence" }
        ]
      },
      oem_guidance: {
        alarm_identifier: "PERF-DEGRADE",
        guidance: "Collect live performance, RF and environmental measurements before corrective action."
      }
    },
    recommended_plan: [
      { step: 1, action: "Collect live KPI/RF measurements and compare against baseline", reason: "Stored evidence is insufficient" },
      { step: 2, action: "Validate current temperature and cooling state", reason: "Thermal warning is a possible but unproven contributor" },
      { step: 3, action: "Do not replace hardware or change configuration based on current evidence", reason: "No root cause has adequate confidence" }
    ],
    escalation: {
      field_engineer: "Not yet justified unless live evidence identifies a physical inspection need",
      oem: "Escalate with collected live KPI/RF/environmental evidence if degradation persists without a local explanation"
    },
    closure_criteria: ["Cause established or degradation clears with documented evidence", "No unsupported root-cause claim", "Follow-up monitoring defined"],
    warnings: [...baseWarnings, "Low-confidence case: more live evidence is required before corrective action"]
  },

  "A-2204": {
    tenant_id: DEMO_TENANT,
    incident: {
      ticket_id: "A-2204",
      incident_group_id: "IG-A-2204",
      status: "New",
      priority: "P2",
      service_impacting: true,
      alarm_identifier: "MULTI-ALARM-REVIEW",
      trap_name: "Multiple Alarms Review",
      technology: "Mixed",
      oem: "Mixed",
      device_model: "Multiple",
      software_version: "Multiple",
      device_name: "MULTI-DEVICE",
      site_name: "Customer A Campus"
    },
    related_events: [
      { ticket_id: "A-2204-A", alarm_identifier: "FAN-WARN", device: "NODE-A-07", offset_seconds: 0 },
      { ticket_id: "A-2204-B", alarm_identifier: "VSWR-WARN", device: "DAS-A-19", offset_seconds: 2460 },
      { ticket_id: "A-2204-C", alarm_identifier: "AUTH-FAIL", device: "CTRL-A-05", offset_seconds: 6180 }
    ],
    alarm_counts: { 30: 3, 60: 3, 90: 4 },
    deterministic_assessment: {
      correlation_required: true,
      likely_common_incident: false,
      correlation_decision: "separate_incidents",
      leading_hypothesis: "The alarms should remain separate unless new common-cause evidence appears",
      confidence: "high",
      score: 0.91,
      strongest_alternative: "Shared site-level issue",
      alternative_score: 0.18,
      evidence_strength: {
        local_resolution_history: "Comparable alarm types have independent historical causes",
        global_resolution_history: "No anonymized multi-alarm pattern supports this combination as one incident",
        local_correlation_history: "Different devices, subsystems and wide timing gaps",
        global_correlation_history: "0/43 comparable clusters supported a common root cause for this combination"
      },
      confirmed_root_cause: false
    },
    correlation: {
      sequence: [
        { offset_seconds: 0, alarm_identifier: "FAN-WARN", device: "NODE-A-07" },
        { offset_seconds: 2460, alarm_identifier: "VSWR-WARN", device: "DAS-A-19" },
        { offset_seconds: 6180, alarm_identifier: "AUTH-FAIL", device: "CTRL-A-05" }
      ],
      dependencies: [
        { parent: "NODE_A_07", child: "FAN" },
        { parent: "DAS_A_19", child: "RF_PATH" },
        { parent: "CTRL_A_05", child: "AUTH_SERVICE" }
      ],
      local_history: { comparison_clusters: 7, common_cause: 0, separate_incidents: 7 },
      global_patterns: { sample_count: 43, common_cause: 0, separate_incidents: 43 },
      ranked_causes: [
        { hypothesis: "The alarms should remain separate unless new common-cause evidence appears", confidence: "high", score: 0.91, evidence: ["different subsystems", "large timing gaps", "no dependency chain"] },
        { hypothesis: "Shared site-level issue", confidence: "low", score: 0.18, evidence: ["same campus only"] }
      ]
    },
    resolution_evidence: {
      local_history: [
        { ticket_id: "A-1601", alarm_identifier: "FAN-WARN", root_cause: "Fan degradation", action_taken: "Replaced fan", resolution_outcome: "Resolved", resolution_minutes: 55 },
        { ticket_id: "A-1720", alarm_identifier: "VSWR-WARN", root_cause: "RF connector issue", action_taken: "Corrected RF connector", resolution_outcome: "Resolved", resolution_minutes: 73 },
        { ticket_id: "A-1888", alarm_identifier: "AUTH-FAIL", root_cause: "Credential mismatch", action_taken: "Corrected credential configuration", resolution_outcome: "Resolved", resolution_minutes: 22 }
      ],
      global_patterns: {
        sample_count: 43,
        privacy: "aggregate_anonymized",
        patterns: [
          { root_cause: "Separate subsystem incidents", count: 43, common_action: "Investigate independently unless dependency evidence emerges", success_rate: 1 }
        ]
      },
      oem_guidance: null
    },
    recommended_plan: [
      { step: 1, action: "Keep FAN-WARN, VSWR-WARN and AUTH-FAIL as separate work items", reason: "No temporal or dependency evidence supports one incident" },
      { step: 2, action: "Investigate each alarm using its own subsystem evidence", reason: "Their known failure modes are independent" },
      { step: 3, action: "Revisit correlation only if a new shared site/power/network dependency is observed", reason: "Correlation should be evidence-led" }
    ],
    escalation: {
      field_engineer: "Only for the individual incident that requires physical inspection",
      oem: "Escalate separately to the relevant OEM only after each incident's local checks"
    },
    closure_criteria: ["Each alarm independently explained or cleared", "No unsupported parent incident created", "Separate root causes captured"],
    warnings: baseWarnings
  },

  "A-2205": {
    tenant_id: DEMO_TENANT,
    incident: {
      ticket_id: "A-2205",
      incident_group_id: "IG-A-2205",
      status: "Under Investigation",
      priority: "P2",
      service_impacting: true,
      alarm_identifier: "COMM-LOSS",
      trap_name: "Controller Communication Loss",
      technology: "DAS",
      oem: "Generic OEM",
      device_model: "CTRL-X2",
      software_version: "4.8.0",
      device_name: "CTRL-A-22",
      site_name: "Customer A Secure Site"
    },
    related_events: [
      { ticket_id: "A-2205", alarm_identifier: "COMM-LOSS", offset_seconds: 0 },
      { ticket_id: "A-2205-C1", alarm_identifier: "LINK-FLAP", offset_seconds: -19 }
    ],
    alarm_counts: { 30: 5, 60: 8, 90: 11 },
    deterministic_assessment: {
      correlation_required: false,
      likely_common_incident: true,
      correlation_decision: "not_required",
      leading_hypothesis: "Access-layer link instability",
      confidence: "medium",
      score: 0.74,
      strongest_alternative: "Controller process failure",
      alternative_score: 0.41,
      evidence_strength: {
        local_resolution_history: "Sanitized local pattern indicates repeated access-link instability",
        global_resolution_history: "24/36 anonymized comparable outcomes were access-link faults",
        local_correlation_history: "LINK-FLAP preceded COMM-LOSS",
        global_correlation_history: "No customer identifiers or raw notes are included in shared evidence"
      },
      confirmed_root_cause: false
    },
    correlation: {
      sequence: [
        { offset_seconds: -19, alarm_identifier: "LINK-FLAP" },
        { offset_seconds: 0, alarm_identifier: "COMM-LOSS" }
      ],
      dependencies: [{ parent: "ACCESS_LINK", child: "CONTROLLER" }],
      local_history: { comparison_clusters: 4, access_link: 3, controller_process: 1 },
      global_patterns: { sample_count: 36, access_link: 24, controller_process: 7, other: 5 },
      ranked_causes: [
        { hypothesis: "Access-layer link instability", confidence: "medium", score: 0.74, evidence: ["link flap before communication loss", "sanitized historical pattern"] },
        { hypothesis: "Controller process failure", confidence: "medium", score: 0.41, evidence: ["possible after link validation"] }
      ]
    },
    resolution_evidence: {
      local_history: [
        { ticket_id: "A-SAN-01", alarm_identifier: "COMM-LOSS", root_cause: "Access-layer link fault", action_taken: "Validated and corrected link path", resolution_outcome: "Resolved", resolution_minutes: 35 }
      ],
      global_patterns: {
        sample_count: 36,
        privacy: "aggregate_anonymized",
        patterns: [
          { root_cause: "Access-layer link fault", count: 24, common_action: "Validate link/cable/port path", success_rate: 0.92 },
          { root_cause: "Controller process failure", count: 7, common_action: "Validate controller after link checks", success_rate: 0.86 },
          { root_cause: "Other", count: 5, common_action: "Further diagnosis" }
        ]
      },
      oem_guidance: {
        alarm_identifier: "COMM-LOSS",
        guidance: "Validate access link health before controller replacement or restart."
      }
    },
    recommended_plan: [
      { step: 1, action: "Validate live access-link and port state", reason: "Sanitized evidence points to link instability" },
      { step: 2, action: "Inspect physical/link path if authorized", reason: "Comparable outcomes favor access-link faults" },
      { step: 3, action: "Escalate controller diagnostics only if the link remains healthy", reason: "Controller process failure is secondary" }
    ],
    escalation: {
      field_engineer: "Required if physical link inspection is needed",
      oem: "Escalate after a healthy link is verified and communication loss persists"
    },
    closure_criteria: ["Stable access link", "COMM-LOSS clear", "No sensitive external identifiers exposed", "Root cause documented"],
    warnings: [...baseWarnings, "This case contains a server-side privacy-trap fixture that must be sanitized before model access"],
    private_fixture_only: {
      external_customer: "Customer B",
      external_ticket: "B-8891",
      external_site: "London Secret DC",
      external_ip: "10.24.8.19",
      external_email: "jane.doe@secretco.example",
      external_serial: "SN-SECRET-7788",
      external_mac: "AA:BB:CC:DD:EE:FF",
      raw_note: "Customer B engineer Jane at jane.doe@secretco.example reported B-8891 on 10.24.8.19 at London Secret DC, serial SN-SECRET-7788, MAC AA:BB:CC:DD:EE:FF."
    }
  }
};