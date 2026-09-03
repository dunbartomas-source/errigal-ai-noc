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
  field: "oem" | "description" | "remedy" | "technical_info";
  variants: string[];
};

export type OemAlarmPlaybookResult = {
  status: OemPlaybookStatus;
  read_only: true;
  source: OemPlaybookSource;
  alarm_identifier: string;
  canonical_alarm_identifier: string;
  oem: string | null;
  context: string | null;
  contexts: string[];
  trap_name: string | null;
  trap_names: string[];
  description: string | null;
  remedy: string | null;
  technical_info: string | null;
  checklist: OemPlaybookStep[];
  alarm_context: string[];
  remedy_information: string[];
  troubleshooting_steps: OemPlaybookStep[];
  source_row_count: number;
  logical_playbook_count: number;
  deduplicated_row_count: number;
  data_conflicts: OemDataConflict[];
  matching_policy: {
    alarm_identifier: "exact_normalized";
    identifier_normalization: "trim_nfkc_casefold_preserve_separators";
    oem_derived_from_alarm_identifier: false;
    oem_source: "explicit_oem_field_only";
    mixed_comment_field_used: false;
    software_version_used: false;
    duplicate_version_rows: "deduplicate_equivalent_guidance";
    metadata_variants: "retain_without_declaring_guidance_conflict";
    conflicting_guidance: "return_data_conflict";
    pilot_scope: "all_alarm_identifiers_in_oem_table";
  };
  warnings: string[];
};

const MATCHING_POLICY = {
  alarm_identifier: "exact_normalized" as const,
  identifier_normalization: "trim_nfkc_casefold_preserve_separators" as const,
  oem_derived_from_alarm_identifier: false as const,
  oem_source: "explicit_oem_field_only" as const,
  mixed_comment_field_used: false as const,
  software_version_used: false as const,
  duplicate_version_rows: "deduplicate_equivalent_guidance" as const,
  metadata_variants: "retain_without_declaring_guidance_conflict" as const,
  conflicting_guidance: "return_data_conflict" as const,
  pilot_scope: "all_alarm_identifiers_in_oem_table" as const,
};

/**
 * Exact identifier matching is intentionally conservative. The real Trap
 * Knowledge table contains identifiers where spaces and underscores distinguish
 * different alarms, so internal separators and punctuation are never rewritten.
 */
export function normalizeAlarmIdentifier(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase();
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

function checklistFromGuidance(
  remedy: string,
  technicalInfo: string,
): OemPlaybookStep[] {
  const candidates: Array<{
    instruction: string;
    source_field: "remedy" | "technical_info";
  }> = [];

  if (remedy.trim()) {
    const explicit = splitExplicitProcedure(remedy);
    for (const instruction of explicit.length ? explicit : [remedy.trim()]) {
      candidates.push({ instruction, source_field: "remedy" });
    }
  }

  // technical_info is supporting evidence unless the controlled source itself
  // clearly formats it as a procedure.
  for (const instruction of splitExplicitProcedure(technicalInfo)) {
    candidates.push({ instruction, source_field: "technical_info" });
  }

  const deduped = new Map<
    string,
    { instruction: string; source_field: "remedy" | "technical_info" }
  >();
  for (const step of candidates) {
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
    context: null,
    contexts: [],
    trap_name: null,
    trap_names: [],
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
    // OEM is accepted only from a dedicated, explicit field. The current real
    // table's `comment` field is intentionally ignored because it mixes OEM-like
    // labels with unrelated technical notes.
    oem: firstValue(row, [
      "oem",
      "OEM",
      "vendor",
      "Vendor",
      "manufacturer",
      "Manufacturer",
    ]),
    context: firstValue(row, ["context", "Context"]),
    trap_name: firstValue(row, ["trap_name", "Trap Name", "trap", "Trap"]),
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
    return !identifier || normalizeAlarmIdentifier(identifier) === canonical;
  });

  if (!matchingRows.length) {
    return baseResult(source, "not_found", requested, [
      ...warnings,
      "No approved Trap Knowledge row matched the alarm identifier. No procedure was generated.",
    ]);
  }

  const extracted = matchingRows.map(canonicalFields);
  const fieldVariants = {
    oem: distinctControlledValues(extracted.map((row) => row.oem)),
    context: distinctControlledValues(extracted.map((row) => row.context)),
    trap_name: distinctControlledValues(extracted.map((row) => row.trap_name)),
    description: distinctControlledValues(extracted.map((row) => row.description)),
    remedy: distinctControlledValues(extracted.map((row) => row.remedy)),
    technical_info: distinctControlledValues(extracted.map((row) => row.technical_info)),
  };

  // context and trap_name are source metadata. Different values there do not
  // invalidate otherwise equivalent controlled troubleshooting guidance.
  const dataConflicts: OemDataConflict[] = [];
  for (const field of [
    "oem",
    "description",
    "remedy",
    "technical_info",
  ] as const) {
    const variants = fieldVariants[field];
    if (variants.length > 1) dataConflicts.push({ field, variants });
  }

  if (dataConflicts.length) {
    return baseResult(source, "data_conflict", requested, [
      ...warnings,
      "The approved Trap Knowledge table contains materially different controlled guidance for the same alarm identifier. No guidance row was selected automatically.",
    ], {
      canonical_alarm_identifier: canonical,
      source_row_count: matchingRows.length,
      deduplicated_row_count: 0,
      data_conflicts: dataConflicts,
      contexts: fieldVariants.context,
      trap_names: fieldVariants.trap_name,
    });
  }

  const oem = fieldVariants.oem[0] ?? null;
  const context = fieldVariants.context[0] ?? null;
  const trapName = fieldVariants.trap_name[0] ?? null;
  const description = fieldVariants.description[0] ?? null;
  const remedy = fieldVariants.remedy[0] ?? null;
  const technicalInfo = fieldVariants.technical_info[0] ?? null;
  const checklist = checklistFromGuidance(remedy ?? "", technicalInfo ?? "");

  const metadataWarnings: string[] = [];
  if (fieldVariants.trap_name.length > 1) {
    metadataWarnings.push(
      `${fieldVariants.trap_name.length} trap-name variants exist for this alarm identifier; they were retained as metadata because the controlled troubleshooting guidance is equivalent.`,
    );
  }
  if (fieldVariants.context.length > 1) {
    metadataWarnings.push(
      `${fieldVariants.context.length} context variants exist for this alarm identifier; they were retained as metadata.`,
    );
  }
  if (!oem && source === "keystats_table") {
    metadataWarnings.push(
      "OEM identity is not available from a dedicated OEM field in the current Trap Knowledge data. The mixed comment field was ignored and no OEM was inferred.",
    );
  }

  return baseResult(source, "success", requested, [
    ...warnings,
    ...metadataWarnings,
    ...(matchingRows.length > 1
      ? [
          `${matchingRows.length} source rows were consolidated into one logical playbook because their controlled troubleshooting guidance is equivalent.`,
        ]
      : []),
    ...(!checklist.length
      ? [
          "The alarm row contains controlled context but no actionable remedy/checklist step. Escalate the documentation gap rather than inventing one.",
        ]
      : []),
  ], {
    canonical_alarm_identifier: canonical,
    oem,
    context,
    contexts: fieldVariants.context,
    trap_name: trapName,
    trap_names: fieldVariants.trap_name,
    description,
    remedy,
    technical_info: technicalInfo,
    checklist,
    alarm_context: [context, description, trapName].filter(Boolean) as string[],
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
      "AI_NOC_DATA_SERVICE_URL is not configured for the approved Trap Knowledge table.",
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
        "The alarm identifier was not found in the approved Trap Knowledge table.",
      ]);
    }
    if (!response.ok) throw new Error(`data service HTTP ${response.status}`);

    const evidence = await response.json();
    if (evidence?.status !== "success") {
      return baseResult("keystats_table", "not_found", normalized, [
        "The alarm identifier was not found in the approved Trap Knowledge table.",
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
      `Read-only Trap Knowledge adapter unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    ]);
  }
}

function fromSyntheticCases(identifier: string): OemAlarmPlaybookResult {
  const normalized = normalizeAlarmIdentifier(identifier);
  const selected = Object.values(COPILOT_CASES).find(
    (candidate: any) =>
      normalizeAlarmIdentifier(candidate?.incident?.alarm_identifier) === normalized,
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
    .flatMap((row: any) => [
      row?.technical_info,
      row?.guidance,
      row?.recommended_action,
      row?.resolution,
    ])
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
    context: selected?.incident?.summary,
    trap_name: selected?.incident?.trap_name,
    description: selected?.incident?.summary ?? selected?.incident?.trap_name,
    remedy: numbered(remedyItems),
    technical_info: numbered([...new Set([...guidanceItems, ...reasonItems])]),
  };

  return buildOemAlarmPlaybookFromRows(
    "synthetic_demo",
    normalized,
    normalized,
    [row],
    ["Synthetic demonstration guidance; live validation uses the approved Trap Knowledge table."],
  );
}

export async function getOemAlarmPlaybook(
  alarmIdentifier: string,
): Promise<OemAlarmPlaybookResult> {
  const source = String(process.env.AI_NOC_DATA_SOURCE ?? "synthetic").toLowerCase();
  return source === "keystats"
    ? fromOemTable(alarmIdentifier)
    : fromSyntheticCases(alarmIdentifier);
}
