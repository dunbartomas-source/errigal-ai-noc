import { COPILOT_CASES } from "./copilot_cases";

export type CopilotSourceMode = "synthetic" | "keystats";

export type CopilotSourceResult =
  | {
      status: "success";
      source: CopilotSourceMode;
      read_only: true;
      is_live: boolean;
      case_data: any;
      warnings: string[];
    }
  | {
      status: "not_found" | "source_unavailable";
      source: CopilotSourceMode;
      read_only: true;
      is_live: boolean;
      case_data: null;
      warnings: string[];
    };

function configuredSource(): CopilotSourceMode {
  const requested = String(process.env.AI_NOC_DATA_SOURCE ?? "synthetic").toLowerCase();
  return requested === "keystats" ? "keystats" : "synthetic";
}

function serviceUrl(identifier: string): string | null {
  const base = String(process.env.AI_NOC_DATA_SERVICE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!base) return null;
  return `${base}/lookup?identifier=${encodeURIComponent(identifier)}&visibility=internal&limit=100`;
}

function firstValue(
  row: any,
  keys: string[],
  fallback = "Unknown",
): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return fallback;
}

function toCaseData(identifier: string, evidence: any) {
  const keyStats = evidence.keyStats ?? {};
  const tickets = Array.isArray(keyStats.ticketSummary) ? keyStats.ticketSummary : [];
  const alarms = Array.isArray(keyStats.dailyAlarm) ? keyStats.dailyAlarm : [];
  const resolutions = Array.isArray(evidence.resolutionInfo)
    ? evidence.resolutionInfo
    : [];
  const traps = Array.isArray(evidence.trapKnowledge)
    ? evidence.trapKnowledge
    : [];
  const primary = tickets[0] ?? alarms[0] ?? {};
  const alarmId = evidence.canonicalAlarmIdentifier ?? identifier;
  const ticketId = firstValue(
    primary,
    ["ticket_id", "ticket", "case_id"],
    `ALARM-${alarmId}`,
  );

  const rootCauses = resolutions.reduce((acc: Record<string, number>, row: any) => {
    const value = firstValue(row, ["root_cause", "Root Cause"], "Unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

  const rankedCauses = Object.entries(rootCauses)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 5)
    .map(([cause, count]) => ({
      cause,
      evidence_count: count,
      confidence: resolutions.length
        ? Number(((count as number) / resolutions.length).toFixed(2))
        : 0,
    }));

  // These source references are retained only inside the deterministic data
  // layer so the historical-note sanitizer can remove them before evidence is
  // exposed to Resolution Intelligence. They are never returned by the public
  // resolution-history tool.
  const resolutionNotes = resolutions.map((row: any) => ({
    resolution: firstValue(
      row,
      ["resolution", "Resolution"],
      "Historical resolution available",
    ),
    root_cause: firstValue(row, ["root_cause", "Root Cause"], "Unknown"),
    notes: firstValue(row, ["resolution_notes", "Resolution Notes"], ""),
    _source_ticket_id: firstValue(row, ["ticket_id", "ticket"], ""),
    _source_change_id: firstValue(row, ["change_id", "change"], ""),
    evidence_source: "real_resolution_info",
  }));

  const trapGuidance = traps.slice(0, 10).map((row: any) => ({
    alarm_identifier: alarmId,
    oem: firstValue(
      row,
      ["oem", "OEM", "vendor", "Vendor", "manufacturer", "Manufacturer"],
      "Unknown",
    ),
    context: firstValue(row, ["context", "Context"], ""),
    trap_name: firstValue(row, ["trap_name", "Trap Name"], ""),
    description: firstValue(row, ["description", "Description"], ""),
    remedy: firstValue(row, ["remedy", "Remedy"], ""),
    technical_info: firstValue(row, ["technical_info", "Technical Info"], ""),
    evidence_source: "real_trap_knowledge",
  }));

  return {
    tenant_id: "keystats-shared",
    incident: {
      ticket_id: ticketId,
      alarm_identifier: alarmId,
      summary: `Operational context for alarm ${alarmId}`,
      severity: firstValue(primary, ["severity", "Severity"], "Unknown"),
    },
    related_events: alarms.slice(0, 25),
    alarm_counts: {
      30: Math.min(alarms.length, 30),
      60: Math.min(alarms.length, 60),
      90: alarms.length,
    },
    deterministic_assessment: {
      status: "evidence_available",
      key_stats_rows: tickets.length + alarms.length,
      resolution_rows: resolutions.length,
      trap_knowledge_rows: traps.length,
    },
    correlation: {
      sequence: alarms.slice(0, 10),
      dependencies: [],
      local_history: { comparison_clusters: tickets.length },
      global_patterns: {
        sample_count: resolutions.length,
        privacy: "aggregate_anonymized",
      },
      ranked_causes: rankedCauses,
    },
    resolution_evidence: {
      local_history: resolutionNotes.slice(0, 25),
      global_patterns: {
        sample_count: resolutions.length,
        root_causes: rootCauses,
      },
      trap_guidance: trapGuidance,
    },
    recommended_plan: [
      {
        step: 1,
        action:
          "Use the dedicated Trap Knowledge/OEM troubleshooting tool for first-line guidance.",
        source: "v113_progressive_tooling",
      },
    ],
    escalation: {
      required: false,
      criteria: [
        "Escalate if the alarm persists after approved troubleshooting and validation.",
      ],
    },
    closure_criteria: [
      "Alarm clears",
      "Service health is verified",
      "Resolution is documented",
    ],
    warnings: [
      ...(evidence.warnings ?? []),
      "Operational KeyStats availability depends on the approved data-service contract. Resolution and Trap Knowledge rows are read-only reference evidence.",
    ],
  };
}

async function getKeystatsCase(identifier: string): Promise<CopilotSourceResult> {
  const url = serviceUrl(identifier);
  if (!url) {
    return {
      status: "source_unavailable",
      source: "keystats",
      read_only: true,
      is_live: false,
      case_data: null,
      warnings: [
        "KeyStats data source selected but AI_NOC_DATA_SERVICE_URL is not configured.",
      ],
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        authorization: process.env.AI_NOC_DATA_SERVICE_TOKEN
          ? `Bearer ${process.env.AI_NOC_DATA_SERVICE_TOKEN}`
          : "",
      },
      cache: "no-store",
    });
    if (response.status === 404) {
      return {
        status: "not_found",
        source: "keystats",
        read_only: true,
        is_live: false,
        case_data: null,
        warnings: ["No matching alarm identifier in the approved data service."],
      };
    }
    if (!response.ok) throw new Error(`data service HTTP ${response.status}`);

    const evidence = await response.json();
    if (evidence?.status !== "success") {
      return {
        status: "not_found",
        source: "keystats",
        read_only: true,
        is_live: false,
        case_data: null,
        warnings: ["No matching alarm identifier in the approved data service."],
      };
    }

    return {
      status: "success",
      source: "keystats",
      read_only: true,
      is_live: Boolean(evidence.isLive),
      case_data: toCaseData(identifier, evidence),
      warnings: [],
    };
  } catch (error) {
    return {
      status: "source_unavailable",
      source: "keystats",
      read_only: true,
      is_live: false,
      case_data: null,
      warnings: [
        `Read-only KeyStats adapter unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ],
    };
  }
}

export async function getCopilotIncidentCase(
  tenantId: string,
  ticketId: string,
  alarmIdentifier?: string,
): Promise<CopilotSourceResult> {
  const source = configuredSource();
  if (source === "keystats") {
    return getKeystatsCase(alarmIdentifier?.trim() || ticketId.trim());
  }

  const wantedAlarm = String(alarmIdentifier ?? ticketId).trim().toLowerCase();
  const selected =
    COPILOT_CASES[ticketId] ??
    Object.values(COPILOT_CASES).find(
      (candidate: any) =>
        String(candidate?.incident?.alarm_identifier ?? "")
          .trim()
          .toLowerCase() === wantedAlarm,
    );
  if (!selected || selected.tenant_id !== tenantId) {
    return {
      status: "not_found",
      source,
      read_only: true,
      is_live: false,
      case_data: null,
      warnings: ["No matching demo ticket or alarm identifier"],
    };
  }
  return {
    status: "success",
    source,
    read_only: true,
    is_live: false,
    case_data: selected,
    warnings: [],
  };
}
