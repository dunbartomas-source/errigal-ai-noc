import { COPILOT_CASES } from "./copilot_cases";

export type OemPlaybookSource = "keystats_table" | "synthetic_demo";

export type OemPlaybookStep = {
  id: string;
  instruction: string;
  source_field: string;
};

export type OemAlarmPlaybookResult =
  | {
      status: "success";
      read_only: true;
      source: OemPlaybookSource;
      alarm_identifier: string;
      canonical_alarm_identifier: string;
      oem: string;
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
    }
  | {
      status: "not_found" | "source_unavailable";
      read_only: true;
      source: OemPlaybookSource;
      alarm_identifier: string;
      canonical_alarm_identifier: string;
      oem: null;
      alarm_context: [];
      remedy_information: [];
      troubleshooting_steps: [];
      source_row_count: 0;
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
    .replace(/\u2022/g, "\n")
    .replace(/\s+(?=\d+[.)]\s+)/g, "\n")
    .replace(/\s+(?=[A-Z][.)]\s+)/g, "\n");

  const lines = normalized
    .split(/\n+|\s*;\s*/)
    .map((line) => line.replace(/^[-*\dA-Z.)\s]+(?=\S)/, "").trim())
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

function buildFromRows(
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

    // The protected lookup endpoint already scopes rows to the supplied identifier.
    // When a table row exposes an identifier, retain only an exact normalized match.
    return !rowIdentifier || normalizeIdentifier(rowIdentifier) === canonical;
  });

  if (!matchingRows.length) {
    return {
      status: "not_found",
      read_only: true,
      source: "keystats_table",
      alarm_identifier: requested,
      canonical_alarm_identifier: canonical,
      oem: null,
      alarm_context: [],
      remedy_information: [],
      troubleshooting_steps: [],
      source_row_count: 0,
      matching_policy: MATCHING_POLICY,
      warnings: [
        ...warnings,
        "No approved OEM table row matched the alarm identifier. No procedure was generated.",
      ],
    };
  }

  const oems = unique(
    matchingRows.map((row) =>
      firstValue(row, ["vendor", "Vendor", "oem", "OEM", "manufacturer", "Manufacturer"]),
    ),
  );
  const alarmContext = unique(
    matchingRows.flatMap((row) => {
      const value = firstValue(row, [
        "alarm_context",
        "Alarm Context",
        "alarm_description",
        "Alarm Description",
        "trap_description",
        "Trap Description",
        "description",
        "Description",
      ]);
      return value ? [value] : [];
    }),
  );
  const remedies = unique(
    matchingRows.flatMap((row) => {
      const value = firstValue(row, [
        "remedy",
        "Remedy",
        "remedy_information",
        "Remedy Information",
        "recommended_action",
        "Recommended Action",
        "resolution",
        "Resolution",
      ]);
      return value ? [value] : [];
    }),
  );

  const rawSteps = unique(
    matchingRows.flatMap((row) => {
      const values = [
        ["troubleshooting", "Troubleshooting"],
        ["troubleshooting_steps", "Troubleshooting Steps"],
        ["troubleshooting_information", "Troubleshooting Information"],
        ["procedure", "Procedure"],
        ["recommended_action", "Recommended Action"],
        ["remedy", "Remedy"],
      ].map(([lower, title]) => firstValue(row, [lower, title]));

      return values.flatMap((value) => splitProcedure(value));
    }),
  );

  const steps = rawSteps.map((instruction, index) => ({
    id: String.fromCharCode(65 + Math.min(index, 25)),
    instruction,
    source_field: "approved_oem_table",
  }));

  return {
    status: "success",
    read_only: true,
    source: "keystats_table",
    alarm_identifier: requested,
    canonical_alarm_identifier: canonical,
    oem: oems[0] || "OEM listed in approved table",
    alarm_context: alarmContext,
    remedy_information: remedies,
    troubleshooting_steps: steps,
    source_row_count: matchingRows.length,
    matching_policy: MATCHING_POLICY,
    warnings: [
      ...warnings,
      ...(oems.length > 1
        ? ["Multiple OEM labels were present for the same alarm identifier; the first approved label is shown."]
        : []),
      ...(steps.length
        ? []
        : ["The alarm row contains context but no structured troubleshooting step. Escalate the documentation gap rather than inventing one."]),
    ],
  };
}

async function fromOemTable(identifier: string): Promise<OemAlarmPlaybookResult> {
  const normalized = normalizeIdentifier(identifier);
  const url = tableServiceUrl(normalized);
  if (!url) {
    return {
      status: "source_unavailable",
      read_only: true,
      source: "keystats_table",
      alarm_identifier: normalized,
      canonical_alarm_identifier: normalized,
      oem: null,
      alarm_context: [],
      remedy_information: [],
      troubleshooting_steps: [],
      source_row_count: 0,
      matching_policy: MATCHING_POLICY,
      warnings: ["AI_NOC_DATA_SERVICE_URL is not configured for the approved OEM table."],
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
      return buildFromRows(normalized, normalized, [], [
        "The alarm identifier was not found in the approved OEM table.",
      ]);
    }
    if (!response.ok) throw new Error(`data service HTTP ${response.status}`);

    const evidence = await response.json();
    if (evidence?.status !== "success") {
      return buildFromRows(normalized, normalized, [], [
        "The alarm identifier was not found in the approved OEM table.",
      ]);
    }

    return buildFromRows(
      normalized,
      evidence.canonicalAlarmIdentifier ?? normalized,
      Array.isArray(evidence.trapKnowledge) ? evidence.trapKnowledge : [],
      Array.isArray(evidence.warnings) ? evidence.warnings.map(String) : [],
    );
  } catch (error) {
    return {
      status: "source_unavailable",
      read_only: true,
      source: "keystats_table",
      alarm_identifier: normalized,
      canonical_alarm_identifier: normalized,
      oem: null,
      alarm_context: [],
      remedy_information: [],
      troubleshooting_steps: [],
      source_row_count: 0,
      matching_policy: MATCHING_POLICY,
      warnings: [
        `Read-only OEM table adapter unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
    };
  }
}

function fromSyntheticCases(identifier: string): OemAlarmPlaybookResult {
  const normalized = normalizeIdentifier(identifier);
  const selected = Object.values(COPILOT_CASES).find(
    (candidate: any) =>
      normalizeIdentifier(candidate?.incident?.alarm_identifier) === normalized,
  ) as any;

  if (!selected) {
    return {
      status: "not_found",
      read_only: true,
      source: "synthetic_demo",
      alarm_identifier: normalized,
      canonical_alarm_identifier: normalized,
      oem: null,
      alarm_context: [],
      remedy_information: [],
      troubleshooting_steps: [],
      source_row_count: 0,
      matching_policy: MATCHING_POLICY,
      warnings: ["No matching alarm identifier exists in the synthetic demonstration cases."],
    };
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

  const result = buildFromRows(normalized, normalized, rows, [
    "Synthetic demonstration guidance; production testing uses the approved OEM table.",
  ]);

  return result.status === "success"
    ? { ...result, source: "synthetic_demo" }
    : { ...result, source: "synthetic_demo" };
}

export async function getOemAlarmPlaybook(
  alarmIdentifier: string,
): Promise<OemAlarmPlaybookResult> {
  const source = String(process.env.AI_NOC_DATA_SOURCE ?? "synthetic").toLowerCase();
  return source === "keystats"
    ? fromOemTable(alarmIdentifier)
    : fromSyntheticCases(alarmIdentifier);
}
