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
    "_source_ticket_id",
    "_source_change_id",
    "ticket_id",
    "ticket",
    "case_id",
    "change_id",
    "change",
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

type SanitizedText = {
  text: string | null;
  redactions: number;
  omitted_reason: string | null;
};

function sanitizeHistoricalText(value: unknown, row: any): SanitizedText {
  let text = String(value ?? "").trim();
  if (!text) return { text: null, redactions: 0, omitted_reason: null };

  let redactions = 0;
  const replace = (pattern: RegExp, replacement = "[redacted]") => {
    text = text.replace(pattern, () => {
      redactions += 1;
      return replacement;
    });
  };

  // Remove exact identifying values available on the source row first.
  for (const sensitiveValue of sensitiveRowValues(row)) {
    replace(new RegExp(escapeRegExp(sensitiveValue), "gi"));
  }

  // Remove common identifiers that can appear only inside free text.
  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
  replace(/\b(?:https?:\/\/|www\.)\S+\b/gi);
  replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  replace(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi);
  replace(/\b(?:INC|TKT|CASE|SR|WO|CHG|PRB)[-_ ]?\d{3,}\b/gi);
  replace(/\b[A-Z]{1,6}-\d{3,}\b/g);
  replace(/\b(?:SN|S\/N|SERIAL)[:#\s-]*[A-Z0-9-]{4,}\b/gi);
  replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g);
  // The uploaded Resolution table uses six-digit numeric ticket/change IDs.
  // Standalone 5+ digit references are therefore redacted conservatively.
  replace(/\b\d{5,}\b/g);

  text = text
    .replace(/(?:\[redacted\]\s*){2,}/g, "[redacted] ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text === "[redacted]") {
    return {
      text: null,
      redactions,
      omitted_reason: "empty_after_redaction",
    };
  }

  return { text, redactions, omitted_reason: null };
}

const SAFE_TITLE_WORDS = new Set(
  [
    "Replaced",
    "Repaired",
    "Reboot",
    "Rebooted",
    "Restored",
    "Cleared",
    "Reset",
    "Reseated",
    "Checked",
    "Check",
    "Confirmed",
    "Verified",
    "Resolved",
    "Synced",
    "Updated",
    "Upgraded",
    "Removed",
    "Installed",
    "Restarted",
    "Power",
    "Carrier",
    "Commercial",
    "Fiber",
    "Fibre",
    "Backhaul",
    "Hardware",
    "Software",
    "Alarm",
    "Alarms",
    "Module",
    "Remote",
    "Unit",
    "System",
    "Link",
    "Port",
    "Optical",
    "Cable",
    "Connector",
    "Supply",
    "Input",
    "Output",
    "Temperature",
    "Normal",
    "Online",
    "Offline",
    "Battery",
    "Failed",
    "Failure",
    "Fault",
    "Issue",
    "Work",
    "Completed",
    "Prior",
    "Investigation",
    "Service",
    "Signal",
    "Reading",
    "Current",
    "Voltage",
    "Network",
    "Device",
    "Node",
    "Equipment",
    "Maintenance",
    "Config",
    "Configuration",
    "Firmware",
  ].map((value) => value.toLowerCase()),
);

const SAFE_ACRONYMS = new Set([
  "CPI",
  "EMS",
  "HVAC",
  "RF",
  "PSU",
  "UPS",
  "DAS",
  "RRU",
  "RU",
  "BBU",
  "BTS",
  "PIM",
  "VSWR",
  "LTE",
  "NR",
  "5G",
  "4G",
  "CBRS",
  "SFP",
  "ODU",
  "IDU",
  "ALC",
  "DL",
  "UL",
  "NF",
  "ICP",
]);

function conservativeNoteRisk(text: string): string | null {
  if (text.length > 600) return "note_too_long";

  // These phrases often introduce customer/site/person identity. Omit the whole
  // note instead of guessing which following words are sensitive.
  if (
    /\b(customer|client|site|location|building|hotel|school|hospital|airport|venue|engineer|contact|assigned|assignee|address|street|road|avenue|city|county|store|branch|office)\b/i.test(
      text,
    )
  ) {
    return "possible_identity_context";
  }

  // Mixed alpha-numeric host/site codes are high-risk unless already redacted.
  if (/\b[A-Za-z]{2,}[-_][A-Za-z0-9_-]*\d+[A-Za-z0-9_-]*\b/.test(text)) {
    return "possible_host_or_site_code";
  }

  // Reject unknown ALL-CAPS tokens: they are frequently device/site/customer
  // abbreviations in NOC notes. Known technical acronyms remain allowed.
  const acronyms = text.match(/\b[A-Z]{2,10}\b/g) ?? [];
  for (const token of acronyms) {
    if (!SAFE_ACRONYMS.has(token)) return "unknown_uppercase_identifier";
  }

  // Reject unknown Title Case words. This is deliberately conservative: notes
  // that might contain a person's, customer's or site's proper name are omitted.
  const titleWords = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
  for (const token of titleWords) {
    if (!SAFE_TITLE_WORDS.has(token.toLowerCase())) {
      return "possible_proper_name";
    }
  }

  return null;
}

function sanitizeHistoricalNote(value: unknown, row: any): SanitizedText {
  const sanitized = sanitizeHistoricalText(value, row);
  if (!sanitized.text) return sanitized;
  const risk = conservativeNoteRisk(sanitized.text);
  if (risk) {
    return {
      text: null,
      redactions: sanitized.redactions,
      omitted_reason: risk,
    };
  }
  return sanitized;
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
  const lookup = input.ticket_id?.trim() || input.network_identifier?.trim() || alarm;
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

  // All case-level output is constructed from sanitized fields here, before it
  // can reach the Resolution Intelligence model.
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
    const noteResult = sanitizeHistoricalNote(rawNote, row);
    const action =
      actionResult.text || "Historical resolution action withheld after sanitization";

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
          ? noteResult.omitted_reason
            ? "omitted_privacy_risk"
            : "omitted_after_sanitization"
          : "not_available",
      note_omission_reason: noteResult.text ? null : noteResult.omitted_reason,
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
      "change_id",
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
      "Cross-customer resolution evidence is anonymized. Ticket/change IDs and customer-identifying details are never returned to Resolution Intelligence or the operator.",
      "Historical notes are included only when deterministic sanitization considers them safe; uncertain notes are omitted rather than guessed safe.",
      "Historical similarity is evidence, not proof of the current root cause.",
    ],
  };
}
