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
      privacy: "anonymized_no_ticket_ids",
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

  // The adapter may need ticket/customer identifiers internally to retrieve evidence,
  // but they are deliberately removed here before any historical case reaches a model.
  const anonymizedExamples = localRows.slice(0, 25).map((row: any) => {
    const action = firstValue(
      row,
      ["action_taken", "resolution", "Resolution", "resolution_summary"],
      "Historical resolution available",
    );
    return {
      root_cause: firstValue(row, ["root_cause", "Root Cause"]),
      action,
      outcome: firstValue(
        row,
        ["resolution_outcome", "outcome"],
        "Resolved historically",
      ),
      technology_type: firstValue(
        row,
        ["technology_type", "technology", "Technology"],
        "Unknown",
      ),
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
    const action = firstValue(
      row,
      ["common_action", "action", "resolution"],
      "",
    );
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
    privacy: "anonymized_no_ticket_ids",
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
    warnings: [
      ...(result.warnings ?? []),
      "Cross-customer resolution evidence is anonymized. Ticket IDs and customer-identifying details are never returned to the model or operator.",
      "Historical similarity is evidence, not proof of the current root cause.",
    ],
  };
}
