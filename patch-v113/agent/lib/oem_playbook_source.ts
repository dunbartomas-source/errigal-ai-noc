import { COPILOT_CASES } from "./copilot_cases";

export type OemPlaybookSource = "keystats_table" | "synthetic_demo";
export type OemPlaybookStatus =
  | "success"
  | "not_found"
  | "data_conflict"
  | "source_unavailable";

export type OemPlaybookStep = {
  id: string;
  instruction: string;
  source_field: "remedy" | "technical_info";
};

export type OemDataConflict = {
  field: "oem" | "trap_name" | "description" | "remedy" | "technical_info";
  variants: string[];
};

export type OemAlarmPlaybookResult = {
  status: OemPlaybookStatus;
  read_only: true;
  source: OemPlaybookSource;
  alarm_identifier: string;
  canonical_alarm_identifier: string;
  oem: string | null;
  trap_name: string | null;
  description: string | null;
  remedy: string | null;
  technical_info: string | null;
  checklist: OemPlaybookStep[];
  // Backwards-compatible aliases consumed by the current conversational layer.
  alarm_context: string[];
  remedy_information: string[];
  troubleshooting_steps: OemPlaybookStep[];
  source_row_count: number;
  logical_playbook_count: number;
  deduplicated_row_count: number;
  data_conflicts: OemDataConflict[];
  matching_policy: {
    alarm_identifier: "exact_normalized";
    oem_derived_from_alarm_identifier: true;
    software_version_used: false;
    duplicate_version_rows: "deduplicate_equivalent_guidance";
    conflicting_guidance: "return_data_conflict";
    pilot_scope: "all_alarm_identifiers_in_oem_table";
  };
  warnings: string[];
};

const MATCHING_POLICY = {
  alarm_identifier: "exact_normalized" as const,
  oem_derived_from_alarm_identifier: true as const,
  software_version_used: false as const,
  duplicate_version_rows: "deduplicate_equivalent_guidance" as const,
  conflicting_guidance: "return_data_conflict" as const,
  pilot_scope: "all_alarm_identifiers_in_oem_table" as const,
};

export function normalizeAlarmIdentifier(value: unknown): string {
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

function normalizeControlledText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .toLocaleLowerCase();
}

function distinctControlledValues(values: string[]): string[] {
  const byNormalized = new Map<string, string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const normalized = normalizeControlledText(value);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, value);
  }
  return [...byNormalized.values()];
}

function hasExplicitProcedureStructure(value: string): boolean {
  if (!value.trim()) return false;
  return (
    /(?:^|\n)\s*(?:[-*•▪◦]+|\d+[.)]|[A-Z][.)])\s+\S/m.test(value) ||
    /[•▪◦]/.test(value)
  );
}

function splitExplicitProcedure(value: string): string[] {
  if (!hasExplicitProcedureStructure(value)) return [];
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[•▪◦]/g, "\n• ")
    .replace(/\s+(?=(?:\d+|[A-Z])[.)]\s+)/g, "\n")
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•▪◦]+|\d+[.)]|[A-Z][.)])\s*/, "")
        .trim(),
    )
    .filter((line) => line.length > 2);
}

function checklistFromGuidance(remedy: string, technicalInfo: string): OemPlaybookStep[] {
  const candidateSteps: Array<{ instruction: string; source_field: "remedy" | "technical_info" }> = [];

  if (remedy.trim()) {
    const explicit = splitExplicitProcedure(remedy);
    const remedySteps = explicit.length ? explicit : [remedy.trim()];
    for (const instruction of remedySteps) {
      candidateSteps.push({ instruction, source_field: "remedy" });
    }
  }

  // Technical info is supporting context by default. Only turn it into checklist
  // items when the controlled source itself clearly formats it as a procedure.
  for (const instruction of splitExplicitProcedure(technicalInfo)) {
    candidateSteps.push({ instruction, source_field: "technical_info" });
  }

  const deduped = new Map<string, { instruction: string; source_field: "remedy" | "technical_info" }>();
  for (const step of candidateSteps) {
    const key = normalizeControlledText(step.instruction);
    if (!deduped.has(key)) deduped.set(key, step);
  }

  return [...deduped.values()].map((step, index) => ({
    id: index < 26 ? String.fromCharCode(65 + index) : `S${index + 1}`,
    instruction: step.instruction,
    source_field: step.source_field,
  }));
}

function tableServiceUrl(identifier: string): string | null {
  const base = String(process.env.AI_NOC_DATA_SERVICE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!base) return null;
  return `${base}/lookup?identifier=${encodeURIComponent(identifier)}&visibility=internal&limit=250`;
}

function baseResult(
  source: OemPlaybookSource,
  status: OemPlaybookStatus,
  requestedIdentifier: string,
  warnings: string[],
  overrides: Partial<OemAlarmPlaybookResult> = {},
): OemAlarmPlaybookResult {
  const normalized = normalizeAlarmIdentifier(requestedIdentifier);
  return {
    status,
    read_only: true,
    source,
    alarm_identifier: normalized,
    canonical_alarm_identifier: normalized,
    oem: null,
    trap_name: null,
    description: null,
    remedy: null,
    technical_info: null,
    checklist: [],
    alarm_context: [],
    remedy_information: [],
    troubleshooting_steps: [],
    source_row_count: 0,
    logical_playbook_count: 0,
    deduplicated_row_count: 0,
    data_conflicts: [],
    matching_policy: MATCHING_POLICY,
    warnings,
    ...overrides,
  };
}

function rowIdentifier(row: any): string {
  return firstValue(row, [
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
}

function canonicalFields(row: any) {
  return {
    oem: firstValue(row, ["oem", "OEM", "vendor", "Vendor", "manufacturer", "Manufacturer", "comment", "Comment"]),
    trap_name: firstValue(row, ["trap_name", "Trap Name", "trap", "Trap", "context", "Context"]),
    description: firstValue(row, [
      "description",
      "Description",
      "alarm_description",
      "Alarm Description",
      "trap_description",
      "Trap Description",
      "alarm_context",
      "Alarm Context",
    ]),
    remedy: firstValue(row, [
      "remedy",
      "Remedy",
      "remedy_information",
      "Remedy Information",
      "recommended_action",
      "Recommended Action",
      "resolution",
      "Resolution",
    ]),
    technical_info: firstValue(row, [
      "technical_info",
      "Technical Info",
      "technical_information",
      "Technical Information",
      "technical_notes",
      "Technical Notes",
      "troubleshooting",
      "Troubleshooting",
      "troubleshooting_information",
      "Troubleshooting Information",
      "procedure",
      "Procedure",
    ]),
  };
}

export function buildOemAlarmPlaybookFromRows(
  source: OemPlaybookSource,
  requestedIdentifier: string,
  canonicalIdentifier: string,
  rows: any[],
  warnings: string[] = [],
): OemAlarmPlaybookResult {
  const requested = normalizeAlarmIdentifier(requestedIdentifier);
  const canonical = normalizeAlarmIdentifier(canonicalIdentifier || requestedIdentifier);
  const matchingRows = rows.filter((row) => {
    const identifier = rowIdentifier(row);
    // Endpoint responses are already identifier-scoped. If the row contains an
    // identifier, exact normalized equality is a second no-cross-alarm guard.
    return !identifier || normalizeAlarmIdentifier(identifier) === canonical;
  });

  if (!matchingRows.length) {
    return baseResult(source, "not_found", requested, [
      ...warnings,
      "No approved OEM table row matched the alarm identifier. No procedure was generated.",
    ]);
  }

  const extracted = matchingRows.map(canonicalFields);
  const fieldVariants = {
    oem: distinctControlledValues(extracted.map((row) => row.oem)),
    trap_name: distinctControlledValues(extracted.map((row) => row.trap_name)),
    description: distinctControlledValues(extracted.map((row) => row.description)),
    remedy: distinctControlledValues(extracted.map((row) => row.remedy)),
    technical_info: distinctControlledValues(extracted.map((row) => row.technical_info)),
  };

  const dataConflicts: OemDataConflict[] = [];
  for (const [field, variants] of Object.entries(fieldVariants) as Array<[
    keyof typeof fieldVariants,
    string[],
  ]>) {
    if (variants.length > 1) {
      dataConflicts.push({ field, variants });
    }
  }

  if (dataConflicts.length) {
    return baseResult(source, "data_conflict", requested, [
      ...warnings,
      "The approved OEM table contains materially different controlled guidance for the same alarm identifier. No row was selected automatically.",
    ], {
      canonical_alarm_identifier: canonical,
      source_row_count: matchingRows.length,
      deduplicated_row_count: 0,
      data_conflicts: dataConflicts,
    });
  }

  const oem = fieldVariants.oem[0] ?? null;
  const trapName = fieldVariants.trap_name[0] ?? null;
  const description = fieldVariants.description[0] ?? null;
  const remedy = fieldVariants.remedy[0] ?? null;
  const technicalInfo = fieldVariants.technical_info[0] ?? null;
  const checklist = checklistFromGuidance(remedy ?? "", technicalInfo ?? "");

  return baseResult(source, "success", requested, [
    ...warnings,
    ...(matchingRows.length > 1
      ? [`${matchingRows.length} source rows were deduplicated into one logical OEM playbook because their controlled guidance is equivalent.`]
      : []),
    ...(!checklist.length
      ? ["The alarm row contains controlled context but no actionable remedy/checklist step. Escalate the documentation gap rather than inventing one."]
      : []),
  ], {
    canonical_alarm_identifier: canonical,
    oem,
    trap_name: trapName,
    description,
    remedy,
    technical_info: technicalInfo,
    checklist,
    alarm_context: [description, trapName].filter(Boolean) as string[],
    remedy_information: [remedy].filter(Boolean) as string[],
    troubleshooting_steps: checklist,
    source_row_count: matchingRows.length,
    logical_playbook_count: 1,
    deduplicated_row_count: Math.max(0, matchingRows.length - 1),
  });
}

async function fromOemTable(identifier: string): Promise<OemAlarmPlaybookResult> {
  const normalized = normalizeAlarmIdentifier(identifier);
  const url = tableServiceUrl(normalized);
  if (!url) {
    return baseResult("keystats_table", "source_unavailable", normalized, [
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
      return baseResult("keystats_table", "not_found", normalized, [
        "The alarm identifier was not found in the approved OEM table.",
      ]);
    }
    if (!response.ok) throw new Error(`data service HTTP ${response.status}`);

    const evidence = await response.json();
    if (evidence?.status !== "success") {
      return baseResult("keystats_table", "not_found", normalized, [
        "The alarm identifier was not found in the approved OEM table.",
      ]);
    }

    return buildOemAlarmPlaybookFromRows(
      "keystats_table",
      normalized,
      evidence.canonicalAlarmIdentifier ?? normalized,
      Array.isArray(evidence.trapKnowledge) ? evidence.trapKnowledge : [],
      Array.isArray(evidence.warnings) ? evidence.warnings.map(String) : [],
    );
  } catch (error) {
    return baseResult("keystats_table", "source_unavailable", normalized, [
      `Read-only OEM table adapter unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    ]);
  }
}

function fromSyntheticCases(identifier: string): OemAlarmPlaybookResult {
  const normalized = normalizeAlarmIdentifier(identifier);
  const selected = Object.values(COPILOT_CASES).find(
    (candidate: any) => normalizeAlarmIdentifier(candidate?.incident?.alarm_identifier) === normalized,
  ) as any;

  if (!selected) {
    return baseResult("synthetic_demo", "not_found", normalized, [
      "No matching alarm identifier exists in the synthetic demonstration cases.",
    ]);
  }

  const guidance = selected?.resolution_evidence?.oem_guidance;
  const guidanceRows = Array.isArray(guidance) ? guidance : guidance ? [guidance] : [];
  const plan = Array.isArray(selected?.recommended_plan) ? selected.recommended_plan : [];

  const remedyItems = plan
    .map((row: any) => String(row?.action ?? "").trim())
    .filter(Boolean);
  const guidanceItems = guidanceRows
    .flatMap((row: any) => [row?.technical_info, row?.guidance, row?.recommended_action, row?.resolution])
    .map((value: any) => String(value ?? "").trim())
    .filter(Boolean);
  const reasonItems = plan
    .map((row: any) => String(row?.reason ?? "").trim())
    .filter(Boolean);

  const numbered = (items: string[]) =>
    items.length > 1
      ? items.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : items[0] ?? "";

  const row = {
    alarm_identifier: normalized,
    oem:
      guidanceRows.find((item: any) => item?.oem || item?.vendor)?.oem ??
      guidanceRows.find((item: any) => item?.oem || item?.vendor)?.vendor ??
      selected?.incident?.oem,
    trap_name: selected?.incident?.trap_name,
    description: selected?.incident?.summary ?? selected?.incident?.trap_name,
    remedy: numbered(remedyItems),
    technical_info: numbered([...new Set([...guidanceItems, ...reasonItems])]),
  };

  return buildOemAlarmPlaybookFromRows("synthetic_demo", normalized, normalized, [row], [
    "Synthetic demonstration guidance; live validation uses the approved OEM table.",
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
