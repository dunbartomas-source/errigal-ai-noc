import { getCopilotIncidentCase } from "./copilot_source";

function firstValue(row: any, keys: string[], fallback = "Unknown"): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return fallback;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sensitiveRowValues(row: any): string[] {
  const keys = [
    "ticket_id",
    "ticket",
    "case_id",
    "customer",
    "customer_name",
    "tenant",
    "tenant_id",
    "site",
    "site_name",
    "location",
    "device_name",
    "network_element",
    "hostname",
    "host_name",
    "serial_number",
    "serial",
    "ip_address",
    "ip",
    "engineer",
    "engineer_name",
    "assigned_to",
    "assignee",
    "email",
    "email_address",
    "phone",
    "phone_number",
  ];

  return keys
    .map((key) => row?.[key])
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim())
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);
}

function sanitizeHistoricalText(
  value: unknown,
  row: any,
): { text: string | null; redactions: number } {
  let text = String(value ?? "").trim();
  if (!text) return { text: null, redactions: 0 };

  let redactions = 0;
  const replace = (pattern: RegExp, replacement = "[redacted]") => {
    text = text.replace(pattern, () => {
      redactions += 1;
      return replacement;
    });
  };

  // Remove exact identifying values available on the source row first.
  for (const sensitiveValue of sensitiveRowValues(row)) {
    const pattern = new RegExp(escapeRegExp(sensitiveValue), "gi");
    replace(pattern);
  }

  // Then remove common identifiers that can appear only inside free-text notes.
  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
  replace(/\b(?:https?:\/\/|www\.)\S+\b/gi);
  replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  replace(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi);
  replace(/\b(?:INC|TKT|CASE|SR|WO|CHG|PRB)[-_ ]?\d{3,}\b/gi);
  replace(/\b[A-Z]{1,6}-\d{3,}\b/g);
  replace(/\b(?:SN|S\/N|SERIAL)[:#\s-]*[A-Z0-9-]{4,}\b/gi);
  replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g);

  text = text
    .replace(/(?:\[redacted\]\s*){2,}/g, "[redacted] ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text === "[redacted]") {
    return { text: null, redactions };
  }

  // Keep notes compact so they provide technical context without leaking a raw ticket narrative.
  if (text.length > 600) text = `${text.slice(0, 597).trim()}...`;

  return { text, redactions };
}

function resemblesAlreadyTried(action: string, alreadyTried: string[]): boolean {
  const candidate = normalize(action);
  if (!candidate) return false;
  return alreadyTried.some((item) => {
    const attempted = normalize(item);
    if (!attempted) return false;
    return candidate.includes(attempted) || attempted.includes(candidate);
  });
}

export async function searchResolutionHistory(input: {
  alarm_identifier: string;
  tenant_id?: string;
  ticket_id?: string;
  network_identifier?: string;
  already_tried_actions?: string[];
}) {
  const alarm = input.alarm_identifier.trim();
  const tenant = input.tenant_id?.trim() || "customer-a";
  const lookup =
    input.ticket_id?.trim() ||
    input.network_identifier?.trim() ||
    alarm;
  const result = await getCopilotIncidentCase(tenant, lookup, alarm);

  if (result.status !== "success" || !result.case_data) {
    return {
      status: result.status,
      read_only: true,
      privacy: "anonymized_no_ticket_ids_sanitized_notes",
      alarm_identifier: alarm,
      comparable_case_count: 0,
      global_sample_count: 0,
      anonymized_examples: [],
      patterns: [],
      warnings: result.warnings,
    };
  }

  const data: any = result.case_data;
  const alreadyTried = input.already_tried_actions ?? [];
  const localRows = Array.isArray(data?.resolution_evidence?.local_history)
    ? data.resolution_evidence.local_history
    : [];

  // Source identifiers may be required internally to retrieve evidence, but case-level
  // output is sanitized here BEFORE it reaches the Resolution Intelligence model.
  const anonymizedExamples = localRows.slice(0, 25).map((row: any) => {
    const rawAction = firstValue(
      row,
      ["action_taken", "resolution", "Resolution", "resolution_summary"],
      "Historical resolution available",
    );
    const rawRootCause = firstValue(row, ["root_cause", "Root Cause"]);
    const rawOutcome = firstValue(
      row,
      ["resolution_outcome", "outcome"],
      "Resolved historically",
    );
    const rawTechnology = firstValue(
      row,
      ["technology_type", "technology", "Technology"],
      "Unknown",
    );
    const rawNote = firstValue(
      row,
      [
        "resolution_notes",
        "Resolution Notes",
        "notes",
        "Notes",
        "work_notes",
        "Work Notes",
        "close_notes",
        "Close Notes",
      ],
      "",
    );

    const actionResult = sanitizeHistoricalText(rawAction, row);
    const causeResult = sanitizeHistoricalText(rawRootCause, row);
    const outcomeResult = sanitizeHistoricalText(rawOutcome, row);
    const technologyResult = sanitizeHistoricalText(rawTechnology, row);
    const noteResult = sanitizeHistoricalText(rawNote, row);
    const action = actionResult.text || "Historical resolution action withheld after sanitization";

    return {
      root_cause: causeResult.text || "Unknown",
      action,
      outcome: outcomeResult.text || "Resolved historically",
      technology_type: technologyResult.text || "Unknown",
      sanitized_note: noteResult.text,
      note_privacy_status: noteResult.text
        ? noteResult.redactions > 0
          ? "included_with_redactions"
          : "included_sanitized"
        : rawNote
          ? "omitted_after_sanitization"
          : "not_available",
      already_tried_match: resemblesAlreadyTried(action, alreadyTried),
      evidence_class: "anonymized_historical_resolution",
    };
  });

  const grouped = new Map<
    string,
    { action: string; support_count: number; already_tried_match: boolean }
  >();

  for (const item of anonymizedExamples) {
    const key = normalize(item.action);
    const current = grouped.get(key);
    grouped.set(key, {
      action: item.action,
      support_count: (current?.support_count ?? 0) + 1,
      already_tried_match:
        item.already_tried_match || current?.already_tried_match || false,
    });
  }

  const global = data?.resolution_evidence?.global_patterns ?? {};
  const globalPatterns = Array.isArray(global?.patterns) ? global.patterns : [];
  for (const row of globalPatterns) {
    const actionResult = sanitizeHistoricalText(
      firstValue(row, ["common_action", "action", "resolution"], ""),
      row,
    );
    const action = actionResult.text || "";
    if (!action) continue;
    const key = normalize(action);
    const current = grouped.get(key);
    grouped.set(key, {
      action,
      support_count: (current?.support_count ?? 0) + Number(row?.count ?? 0),
      already_tried_match:
        resemblesAlreadyTried(action, alreadyTried) ||
        current?.already_tried_match ||
        false,
    });
  }

  const patterns = [...grouped.values()].sort((a, b) => {
    if (a.already_tried_match !== b.already_tried_match) {
      return a.already_tried_match ? 1 : -1;
    }
    return b.support_count - a.support_count;
  });

  const totalSupport = patterns.reduce(
    (sum, pattern) => sum + pattern.support_count,
    0,
  );

  return {
    status: "success",
    read_only: true,
    privacy: "anonymized_no_ticket_ids_sanitized_notes",
    alarm_identifier: alarm,
    source: result.source,
    comparable_case_count: anonymizedExamples.length,
    global_sample_count: Number(global?.sample_count ?? 0),
    anonymized_examples: anonymizedExamples,
    patterns: patterns.slice(0, 12).map((pattern) => ({
      ...pattern,
      support_share:
        totalSupport > 0
          ? Number((pattern.support_count / totalSupport).toFixed(3))
          : null,
    })),
    already_tried_actions: alreadyTried,
    redacted_fields: [
      "ticket_id",
      "customer_identity",
      "site_name",
      "unique_device_name",
      "ip_address",
      "serial_number",
      "engineer_identity",
      "raw_notes",
    ],
    allowed_case_level_fields: [
      "root_cause",
      "action",
      "outcome",
      "technology_type",
      "sanitized_note",
    ],
    warnings: [
      ...(result.warnings ?? []),
      "Cross-customer resolution evidence is anonymized. Ticket IDs and customer-identifying details are never returned to the Resolution Intelligence model or operator.",
      "Sanitized historical notes may be shown when they retain useful technical context; raw notes are never returned.",
      "Historical similarity is evidence, not proof of the current root cause.",
    ],
  };
}
