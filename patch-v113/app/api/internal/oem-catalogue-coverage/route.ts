import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LOOKUP_LIMITS = [250, 1000, 5000] as const;
const MAX_CATALOGUE_IDS = 10000;

type ProbeResult = {
  label: string;
  limit: number;
  status: number;
  payload: any;
  identifiers: Set<string>;
  idBearingRowCount: number;
  continuationHint: boolean;
};

function dataServiceConfig() {
  const base = String(process.env.AI_NOC_DATA_SERVICE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const token = String(process.env.AI_NOC_DATA_SERVICE_TOKEN ?? "").trim();
  return { base: base || null, token: token || null };
}

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
    oem: firstValue(row, [
      "oem",
      "OEM",
      "vendor",
      "Vendor",
      "manufacturer",
      "Manufacturer",
      "comment",
      "Comment",
    ]),
    trap_name: firstValue(row, [
      "trap_name",
      "Trap Name",
      "trap",
      "Trap",
      "context",
      "Context",
    ]),
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

function normalizeControlledText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .toLocaleLowerCase();
}

function distinctValues(values: string[]): string[] {
  const distinct = new Set<string>();
  for (const value of values) {
    const normalized = normalizeControlledText(value);
    if (normalized) distinct.add(normalized);
  }
  return [...distinct];
}

function objectArrays(payload: any): Array<{ path: string; rows: any[] }> {
  const arrays: Array<{ path: string; rows: any[] }> = [];
  const seen = new Set<any>();

  function visit(value: any, path = "root") {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      arrays.push({ path, rows: value });
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], `${path}[${index}]`);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${path}.${key}`);
    }
  }

  visit(payload);
  return arrays;
}

function trapKnowledgeRows(payload: any): any[] {
  if (Array.isArray(payload?.trapKnowledge)) return payload.trapKnowledge;
  if (Array.isArray(payload?.trap_knowledge)) return payload.trap_knowledge;

  const candidates = objectArrays(payload)
    .filter(({ path, rows }) => {
      const lowerPath = path.toLowerCase();
      if (!lowerPath.includes("trap") && !lowerPath.includes("knowledge")) return false;
      return rows.some((row) => rowIdentifier(row));
    })
    .sort((a, b) => b.rows.length - a.rows.length);

  return candidates[0]?.rows ?? [];
}

function continuationHint(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  const serializedKeys = Object.keys(payload).map((key) => key.toLowerCase());
  if (
    serializedKeys.some((key) =>
      ["nextcursor", "next_cursor", "nextpage", "next_page", "hasmore", "has_more", "truncated"].includes(key),
    )
  ) {
    const candidate =
      payload.nextCursor ??
      payload.next_cursor ??
      payload.nextPage ??
      payload.next_page ??
      payload.hasMore ??
      payload.has_more ??
      payload.truncated;
    return Boolean(candidate);
  }
  return false;
}

async function requestLookup(params: Record<string, string>): Promise<{ status: number; payload: any }> {
  const { base, token } = dataServiceConfig();
  if (!base || !token) return { status: 0, payload: null };

  const url = new URL(`${base}/lookup`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  } catch {
    return { status: 0, payload: null };
  }
}

async function enumerationProbe(
  label: string,
  params: Record<string, string>,
  limit: number,
): Promise<ProbeResult> {
  const result = await requestLookup({ ...params, visibility: "internal", limit: String(limit) });
  const rows = trapKnowledgeRows(result.payload);
  const identifiers = new Set(
    rows.map((row) => normalizeIdentifier(rowIdentifier(row))).filter(Boolean),
  );
  return {
    label,
    limit,
    status: result.status,
    payload: result.payload,
    identifiers,
    idBearingRowCount: rows.filter((row) => rowIdentifier(row)).length,
    continuationHint: continuationHint(result.payload),
  };
}

async function enumerateCatalogue() {
  const probes: ProbeResult[] = [];
  for (const limit of LOOKUP_LIMITS) {
    probes.push(await enumerationProbe("no_identifier", {}, limit));
    probes.push(await enumerationProbe("wildcard_star", { identifier: "*" }, limit));
    probes.push(await enumerationProbe("wildcard_percent", { identifier: "%" }, limit));
  }

  const viable = probes
    .filter((probe) => probe.status >= 200 && probe.status < 300 && probe.identifiers.size > 1)
    .sort((a, b) => b.identifiers.size - a.identifiers.size || b.limit - a.limit);
  const best = viable[0] ?? null;
  if (!best) {
    return {
      available: false,
      complete: false,
      best: null,
      probes,
      completeness_reason: "The existing lookup contract did not expose more than one OEM alarm identifier.",
    };
  }

  const sameLabel = probes
    .filter((probe) => probe.label === best.label && probe.status >= 200 && probe.status < 300)
    .sort((a, b) => a.limit - b.limit);
  const counts = sameLabel.map((probe) => probe.identifiers.size);
  const maxCount = Math.max(...counts);
  const finalCount = counts[counts.length - 1] ?? 0;
  const hitKnownBoundary = [250, 1000, 5000].includes(best.idBearingRowCount);
  const complete =
    !best.continuationHint &&
    !hitKnownBoundary &&
    finalCount === maxCount &&
    finalCount < MAX_CATALOGUE_IDS;

  return {
    available: true,
    complete,
    best,
    probes,
    completeness_reason: complete
      ? "Distinct identifier count was stable at the largest requested limit with no continuation/truncation signal."
      : "The endpoint may be capped or paginated; full-table coverage cannot be claimed yet.",
  };
}

async function validateIdentifier(identifier: string) {
  const lookup = await requestLookup({
    identifier,
    visibility: "internal",
    limit: "250",
  });

  if (lookup.status < 200 || lookup.status >= 300 || lookup.payload?.status !== "success") {
    return { kind: "lookup_failure" as const };
  }

  const canonical = normalizeIdentifier(
    lookup.payload?.canonicalAlarmIdentifier ??
      lookup.payload?.canonical_alarm_identifier ??
      identifier,
  );
  if (canonical !== identifier) return { kind: "canonical_mismatch" as const };

  const rows = trapKnowledgeRows(lookup.payload);
  if (!rows.length) return { kind: "documentation_gap" as const };

  for (const row of rows) {
    const rowId = normalizeIdentifier(rowIdentifier(row));
    if (rowId && rowId !== identifier) return { kind: "cross_alarm_violation" as const };
  }

  const extracted = rows.map(canonicalFields);
  const variants = {
    oem: distinctValues(extracted.map((row) => row.oem)),
    trap_name: distinctValues(extracted.map((row) => row.trap_name)),
    description: distinctValues(extracted.map((row) => row.description)),
    remedy: distinctValues(extracted.map((row) => row.remedy)),
    technical_info: distinctValues(extracted.map((row) => row.technical_info)),
  };
  const conflicts = Object.entries(variants)
    .filter(([, values]) => values.length > 1)
    .map(([field]) => field);

  if (conflicts.length) {
    return {
      kind: "data_conflict" as const,
      row_count: rows.length,
      conflict_field_count: conflicts.length,
    };
  }

  const hasControlledContent = extracted.some(
    (row) => row.description || row.remedy || row.technical_info || row.trap_name,
  );
  if (!hasControlledContent) return { kind: "documentation_gap" as const };

  return {
    kind: "clean_playbook" as const,
    row_count: rows.length,
    deduplicated_version_rows: Math.max(0, rows.length - 1),
  };
}

async function validateUnknownIdentifier() {
  const unknown = `AI-NOC-NOT-FOUND-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lookup = await requestLookup({
    identifier: unknown,
    visibility: "internal",
    limit: "5",
  });
  if (lookup.status === 404) return true;
  if (lookup.status >= 200 && lookup.status < 300) {
    return lookup.payload?.status !== "success" || trapKnowledgeRows(lookup.payload).length === 0;
  }
  return false;
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const { base, token } = dataServiceConfig();
  if (!base || !token) {
    return NextResponse.json(
      {
        status: "source_unavailable",
        preview_only: true,
        configured: false,
        raw_rows_returned: false,
        identifiers_returned: false,
        model_calls: 0,
      },
      { status: 503 },
    );
  }

  const catalogue = await enumerateCatalogue();
  if (!catalogue.available || !catalogue.best) {
    return NextResponse.json({
      status: "enumeration_unavailable",
      preview_only: true,
      configured: true,
      authenticated: catalogue.probes.some(
        (probe) => probe.status > 0 && probe.status !== 401 && probe.status !== 403,
      ),
      catalogue_complete: false,
      completeness_reason: catalogue.completeness_reason,
      enumeration_probe_summary: catalogue.probes.map((probe) => ({
        label: probe.label,
        limit: probe.limit,
        status: probe.status,
        distinct_identifier_count: probe.identifiers.size,
        id_bearing_row_count: probe.idBearingRowCount,
        continuation_hint: probe.continuationHint,
      })),
      raw_rows_returned: false,
      identifiers_returned: false,
      model_calls: 0,
    });
  }

  const identifiers = [...catalogue.best.identifiers].slice(0, MAX_CATALOGUE_IDS);
  const counts = {
    clean_playbooks: 0,
    duplicate_version_groups: 0,
    deduplicated_version_rows: 0,
    data_conflicts: 0,
    documentation_gaps: 0,
    lookup_failures: 0,
    canonical_mismatches: 0,
    cross_alarm_violations: 0,
  };

  // Deliberately sequential: this is a bounded read-only validation harness, not
  // a load test against the Errigal data service.
  for (const identifier of identifiers) {
    const result = await validateIdentifier(identifier);
    if (result.kind === "clean_playbook") {
      counts.clean_playbooks += 1;
      if (result.deduplicated_version_rows > 0) counts.duplicate_version_groups += 1;
      counts.deduplicated_version_rows += result.deduplicated_version_rows;
    } else if (result.kind === "data_conflict") {
      counts.data_conflicts += 1;
    } else if (result.kind === "documentation_gap") {
      counts.documentation_gaps += 1;
    } else if (result.kind === "lookup_failure") {
      counts.lookup_failures += 1;
    } else if (result.kind === "canonical_mismatch") {
      counts.canonical_mismatches += 1;
    } else if (result.kind === "cross_alarm_violation") {
      counts.cross_alarm_violations += 1;
    }
  }

  const unknownIdentifierNotFound = await validateUnknownIdentifier();
  const hardFailures =
    counts.lookup_failures + counts.canonical_mismatches + counts.cross_alarm_violations;

  return NextResponse.json({
    status:
      catalogue.complete && hardFailures === 0 && unknownIdentifierNotFound
        ? "coverage_complete"
        : "coverage_incomplete",
    preview_only: true,
    configured: true,
    authenticated: true,
    catalogue_complete: catalogue.complete,
    completeness_reason: catalogue.completeness_reason,
    enumeration_source: catalogue.best.label,
    catalogue_identifier_count: identifiers.length,
    validated_identifier_count: identifiers.length,
    ...counts,
    unknown_identifier_not_found: unknownIdentifierNotFound,
    software_version_filter_used: false,
    exact_normalized_identifier_matching: true,
    conflict_policy: "fail_closed",
    duplicate_version_policy: "deduplicate_equivalent_guidance",
    raw_rows_returned: false,
    identifiers_returned: false,
    model_calls: 0,
  });
}
