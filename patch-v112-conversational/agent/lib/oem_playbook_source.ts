import { COPILOT_CASES } from "./copilot_cases";

export type OemPlaybookSource = "keystats_table" | "synthetic_demo";

export type OemPlaybookStep = {
  id: string;
  instruction: string;
  source_field: string;
};

export type OemAlarmPlaybookResult = {
  status: "success" | "not_found" | "source_unavailable";
  read_only: true;
  source: OemPlaybookSource;
  alarm_identifier: string;
  canonical_alarm_identifier: string;
  oem: string | null;
  alarm_context: string[];
  remedy_information: string[];
  troubleshooting_steps: OemPlaybookStep[];
  source_row_count: number;
  matching_policy: {
    alarm_identifier: "exact_normalized";
    oem_derived_from_alarm_identifier: true;
    software_version_used: false;
    pilot_scope: "all_alarm_identifiers_in_oem_table";
  };
  warnings: string[];
};

const MATCHING_POLICY = {
  alarm_identifier: "exact_normalized" as const,
  oem_derived_from_alarm_identifier: true as const,
  software_version_used: false as const,
  pilot_scope: "all_alarm_identifiers_in_oem_table" as const,
};

function normalizeIdentifier(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function firstValue(row: any, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function splitProcedure(value: string): string[] {
  const normalized = value
    .replace(/\r/g, "\n")
    .replace(/[•▪◦]/g, "\n")
    .replace(/\s+(?=(?:\d+|[A-Z])[.)]\s+)/g, "\n");

  const lines = normalized
    .split(/\n+|\s*;\s*/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*]+|\d+[.)]|[A-Z][.)])\s*/, "")
        .trim(),
    )
    .filter((line) => line.length > 2);

  return lines.length ? lines : value.trim() ? [value.trim()] : [];
}

function tableServiceUrl(identifier: string): string | null {
  const base = String(process.env.AI_NOC_DATA_SERVICE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!base) return null;

  return `${base}/lookup?identifier=${encodeURIComponent(identifier)}&visibility=internal&limit=250`;
}

function emptyResult(
  source: OemPlaybookSource,
  status: "not_found" | "source_unavailable",
  requestedIdentifier: string,
  warnings: string[],
): OemAlarmPlaybookResult {
  const normalized = normalizeIdentifier(requestedIdentifier);
  return {
    status,
    read_only: true,
    source,
    alarm_identifier: normalized,
    canonical_alarm_identifier: normalized,
    oem: null,
    alarm_context: [],
    remedy_information: [],
    troubleshooting_steps: [],
    source_row_count: 0,
    matching_policy: MATCHING_POLICY,
    warnings,
  };
}

function buildFromRows(
  source: OemPlaybookSource,
  requestedIdentifier: string,
  canonicalIdentifier: string,
  rows: any[],
  warnings: string[] = [],
): OemAlarmPlaybookResult {
  const requested = normalizeIdentifier(requestedIdentifier);
  const canonical = normalizeIdentifier(canonicalIdentifier || requestedIdentifier);

  const matchingRows = rows.filter((row) => {
    const rowIdentifier = firstValue(row, [
      "alarm_identifier",
      "Alarm Identifier",
      "alarm_id",
      "Alarm ID",
      "identifier",
      "Identifier",
      "trap_id",
      "Trap ID",
      "trap_identifier",
      "Trap Identifier",
    ]);

    // The protected endpoint is already identifier-scoped. If the row exposes
    // an identifier itself, require an exact normalized match as a second guard.
    return !rowIdentifier || normalizeIdentifier(rowIdentifier) === canonical;
  });

  if (!matchingRows.length) {
    return emptyResult(source, "not_found", requested, [
      ...warnings,
      "No approved OEM table row matched the alarm identifier. No procedure was generated.",
    ]);
  }

  const oems = unique(
    matchingRows.map((row) =>
      firstValue(row, ["vendor", "Vendor", "oem", "OEM", "manufacturer", "Manufacturer"]),
    ),
  );

  const alarmContext = unique(
    matchingRows.map((row) =>
      firstValue(row, [
        "alarm_context",
        "Alarm Context",
        "alarm_description",
        "Alarm Description",
        "trap_description",
        "Trap Description",
        "description",
        "Description",
      ]),
    ),
  );

  const remedies = unique(
    matchingRows.map((row) =>
      firstValue(row, [
        "remedy",
        "Remedy",
        "remedy_information",
        "Remedy Information",
        "recommended_action",
        "Recommended Action",
        "resolution",
        "Resolution",
      ]),
    ),
  );

  const explicitSteps = unique(
    matchingRows.flatMap((row) =>
      [
        firstValue(row, ["troubleshooting", "Troubleshooting"]),
        firstValue(row, ["troubleshooting_steps", "Troubleshooting Steps"]),
        firstValue(row, ["troubleshooting_information", "Troubleshooting Information"]),
        firstValue(row, ["procedure", "Procedure"]),
      ].flatMap((value) => splitProcedure(value)),
    ),
  );

  // Some source rows place the approved action only in Remedy. Use that as a
  // single supported step rather than inventing additional diagnostics.
  const rawSteps = explicitSteps.length
    ? explicitSteps
    : unique(remedies.flatMap((value) => splitProcedure(value)));

  const troubleshootingSteps = rawSteps.map((instruction, index) => ({
    id: index < 26 ? String.fromCharCode(65 + index) : `S${index + 1}`,
    instruction,
    source_field: explicitSteps.length ? "approved_oem_troubleshooting" : "approved_oem_remedy",
  }));

  return {
    status: "success",
    read_only: true,
    source,
    alarm_identifier: requested,
    canonical_alarm_identifier: canonical,
    oem: oems[0] || "OEM listed in approved table",
    alarm_context: alarmContext,
    remedy_information: remedies,
    troubleshooting_steps: troubleshootingSteps,
    source_row_count: matchingRows.length,
    matching_policy: MATCHING_POLICY,
    warnings: [
      ...warnings,
      ...(oems.length > 1
        ? ["Multiple OEM labels were present for the same alarm identifier; the first approved label is shown."]
        : []),
      ...(troubleshootingSteps.length
        ? []
        : ["The alarm row contains context but no troubleshooting or remedy step. Escalate the documentation gap rather than inventing one."]),
    ],
  };
}

async function fromOemTable(identifier: string): Promise<OemAlarmPlaybookResult> {
  const normalized = normalizeIdentifier(identifier);
  const url = tableServiceUrl(normalized);
  if (!url) {
    return emptyResult("keystats_table", "source_unavailable", normalized, [
      "AI_NOC_DATA_SERVICE_URL is not configured for the approved OEM table.",
    ]);
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
      return emptyResult("keystats_table", "not_found", normalized, [
        "The alarm identifier was not found in the approved OEM table.",
      ]);
    }
    if (!response.ok) throw new Error(`data service HTTP ${response.status}`);

    const evidence = await response.json();
    if (evidence?.status !== "success") {
      return emptyResult("keystats_table", "not_found", normalized, [
        "The alarm identifier was not found in the approved OEM table.",
      ]);
    }

    return buildFromRows(
      "keystats_table",
      normalized,
      evidence.canonicalAlarmIdentifier ?? normalized,
      Array.isArray(evidence.trapKnowledge) ? evidence.trapKnowledge : [],
      Array.isArray(evidence.warnings) ? evidence.warnings.map(String) : [],
    );
  } catch (error) {
    return emptyResult("keystats_table", "source_unavailable", normalized, [
      `Read-only OEM table adapter unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    ]);
  }
}

function fromSyntheticCases(identifier: string): OemAlarmPlaybookResult {
  const normalized = normalizeIdentifier(identifier);
  const selected = Object.values(COPILOT_CASES).find(
    (candidate: any) => normalizeIdentifier(candidate?.incident?.alarm_identifier) === normalized,
  ) as any;

  if (!selected) {
    return emptyResult("synthetic_demo", "not_found", normalized, [
      "No matching alarm identifier exists in the synthetic demonstration cases.",
    ]);
  }

  const guidance = selected?.resolution_evidence?.oem_guidance;
  const guidanceRows = Array.isArray(guidance) ? guidance : guidance ? [guidance] : [];
  const plan = Array.isArray(selected?.recommended_plan) ? selected.recommended_plan : [];
  const rows = [
    ...guidanceRows.map((row: any) => ({
      ...row,
      alarm_identifier: normalized,
      oem: row?.oem ?? row?.vendor ?? selected?.incident?.oem,
      alarm_context: selected?.incident?.trap_name ?? selected?.incident?.summary,
      troubleshooting: row?.guidance ?? row?.resolution ?? row?.recommended_action,
    })),
    ...plan.map((row: any) => ({
      alarm_identifier: normalized,
      oem: selected?.incident?.oem,
      alarm_context: selected?.incident?.trap_name ?? selected?.incident?.summary,
      troubleshooting: row?.action,
      remedy: row?.reason,
    })),
  ];

  return buildFromRows("synthetic_demo", normalized, normalized, rows, [
    "Synthetic demonstration guidance; production testing uses the approved OEM table.",
  ]);
}

export async function getOemAlarmPlaybook(
  alarmIdentifier: string,
): Promise<OemAlarmPlaybookResult> {
  const source = String(process.env.AI_NOC_DATA_SOURCE ?? "synthetic").toLowerCase();
  return source === "keystats"
    ? fromOemTable(alarmIdentifier)
    : fromSyntheticCases(alarmIdentifier);
}
