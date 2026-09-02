import { COPILOT_CASES } from "./copilot_cases";

export type CopilotSourceMode = "synthetic" | "keystats";

export type CopilotSourceResult =
  | { status: "success"; source: CopilotSourceMode; read_only: true; is_live: boolean; case_data: any; warnings: string[] }
  | { status: "not_found" | "source_unavailable"; source: CopilotSourceMode; read_only: true; is_live: boolean; case_data: null; warnings: string[] };

function configuredSource(): CopilotSourceMode {
  const requested = String(process.env.AI_NOC_DATA_SOURCE ?? "synthetic").toLowerCase();
  return requested === "keystats" ? "keystats" : "synthetic";
}

function serviceUrl(identifier: string): string | null {
  let base = String(process.env.AI_NOC_DATA_SERVICE_URL ?? "https://errigal-ai-noc-data-service.vercel.app/api").trim().replace(/\/$/, "");
  if (!base) base = "https://errigal-ai-noc-data-service.vercel.app/api";
  if (!base.endsWith("/api")) base = `${base}/api`;
  return `${base}/lookup?identifier=${encodeURIComponent(identifier)}&visibility=internal&limit=100`;
}

function firstValue(row: any, keys: string[], fallback = "Unknown"): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function toCaseData(identifier: string, evidence: any) {
  const keyStats = evidence.keyStats ?? {};
  const tickets = keyStats.ticketSummary ?? [];
  const alarms = keyStats.dailyAlarm ?? [];
  const resolutions = evidence.resolutionInfo ?? [];
  const traps = evidence.trapKnowledge ?? [];
  const primary = tickets[0] ?? alarms[0] ?? {};
  const alarmId = evidence.canonicalAlarmIdentifier ?? identifier;
  const ticketId = firstValue(primary, ["ticket_id", "ticket", "case_id"], `ALARM-${alarmId}`);
  const rootCauses = resolutions.reduce((acc: Record<string, number>, row: any) => {
    const value = firstValue(row, ["root_cause", "Root Cause"], "Unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  const rankedCauses = Object.entries(rootCauses)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 5)
    .map(([cause, count]) => ({ cause, evidence_count: count, confidence: resolutions.length ? Number((count as number / resolutions.length).toFixed(2)) : 0 }));
  const resolutionNotes = resolutions.map((row: any) => ({
    resolution: firstValue(row, ["resolution", "Resolution"], "Historical resolution available"),
    root_cause: firstValue(row, ["root_cause", "Root Cause"], "Unknown"),
    notes: firstValue(row, ["resolution_notes", "Resolution Notes"], "Resolution notes available"),
    evidence_source: "real_resolution_info"
  }));
  const oemGuidance = traps.slice(0, 10).map((row: any) => ({
    alarm_identifier: alarmId,
    vendor: firstValue(row, ["vendor", "Vendor", "oem", "OEM"]),
    guidance: firstValue(row, ["resolution", "Resolution", "recommended_action", "Recommended Action", "description", "Description"], "OEM guidance available"),
    evidence_source: "real_trap_knowledge"
  }));
  return {
    tenant_id: "keystats-shared",
    incident: { ticket_id: ticketId, alarm_identifier: alarmId, summary: `Historical KeyStats evidence for alarm ${alarmId}`, severity: firstValue(primary, ["severity", "Severity"], "Unknown") },
    related_events: alarms.slice(0, 25),
    alarm_counts: { 30: Math.min(alarms.length, 30), 60: Math.min(alarms.length, 60), 90: alarms.length },
    deterministic_assessment: { status: "evidence_available", key_stats_rows: tickets.length + alarms.length, resolution_rows: resolutions.length, trap_knowledge_rows: traps.length },
    correlation: { sequence: alarms.slice(0, 10), dependencies: [], local_history: { comparison_clusters: tickets.length }, global_patterns: { sample_count: resolutions.length, privacy: "aggregate_anonymized" }, ranked_causes: rankedCauses },
    resolution_evidence: { local_history: resolutionNotes.slice(0, 25), global_patterns: { sample_count: resolutions.length, root_causes: rootCauses }, oem_guidance: oemGuidance },
    recommended_plan: oemGuidance.length ? oemGuidance.slice(0, 5).map((item: any, index: number) => ({ step: index + 1, action: item.guidance, source: item.evidence_source })) : [{ step: 1, action: "Review the matching KeyStats and historical resolution evidence.", source: "synthetic_key_stats" }],
    escalation: { required: false, criteria: ["Escalate if the alarm persists after approved troubleshooting and validation."] },
    closure_criteria: ["Alarm clears", "Service health is verified", "Resolution is documented"],
    warnings: [...(evidence.warnings ?? []), "KeyStats rows are synthetic; resolution and trap knowledge evidence is real shared reference data."]
  };
}

async function getKeystatsCase(identifier: string): Promise<CopilotSourceResult> {
  const url = serviceUrl(identifier);
  if (!url) return { status: "source_unavailable", source: "keystats", read_only: true, is_live: false, case_data: null, warnings: ["KeyStats data source selected but AI_NOC_DATA_SERVICE_URL is not configured."] };
  try {
    const response = await fetch(url, { headers: { authorization: process.env.AI_NOC_DATA_SERVICE_TOKEN ? `Bearer ${process.env.AI_NOC_DATA_SERVICE_TOKEN}` : "", "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "" }, cache: "no-store", redirect: "manual" });
    if (response.status === 404) return { status: "not_found", source: "keystats", read_only: true, is_live: false, case_data: null, warnings: ["No matching alarm identifier in the three-layer data service."] };
    if (!response.ok) throw new Error(`data service HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) throw new Error(`data service returned ${contentType || "non-JSON"} instead of JSON`);
    const evidence = await response.json();
    if (evidence?.status !== "success") return { status: "not_found", source: "keystats", read_only: true, is_live: false, case_data: null, warnings: ["No matching alarm identifier in the three-layer data service."] };
    return { status: "success", source: "keystats", read_only: true, is_live: Boolean(evidence.isLive), case_data: toCaseData(identifier, evidence), warnings: [] };
  } catch (error) {
    return { status: "source_unavailable", source: "keystats", read_only: true, is_live: false, case_data: null, warnings: [`Read-only KeyStats adapter unavailable: ${error instanceof Error ? error.message : "unknown error"}`] };
  }
}

export async function getCopilotIncidentCase(tenantId: string, ticketId: string, alarmIdentifier?: string): Promise<CopilotSourceResult> {
  const source = configuredSource();
  if (source === "keystats") return getKeystatsCase(alarmIdentifier?.trim() || ticketId.trim());
  const selected = COPILOT_CASES[ticketId];
  if (!selected || selected.tenant_id !== tenantId) return { status: "not_found", source, read_only: true, is_live: false, case_data: null, warnings: ["No matching demo ticket"] };
  return { status: "success", source, read_only: true, is_live: false, case_data: selected, warnings: [] };
}
