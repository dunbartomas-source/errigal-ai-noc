import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function dataServiceBase(): string | null {
  const base = String(process.env.AI_NOC_DATA_SERVICE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  return base || null;
}

function normalizedIdentifier(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function rowIdentifier(row: any): string {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "";
  for (const key of [
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
  ]) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return normalizedIdentifier(value);
    }
  }
  return "";
}

function inspectPayload(payload: any) {
  const seen = new Set<any>();
  const arrays: Array<{ path: string; rows: any[] }> = [];

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
  const objectRows = arrays.flatMap(({ rows }) =>
    rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)),
  );
  const identifiers = new Set(objectRows.map(rowIdentifier).filter(Boolean));

  return {
    top_level_keys:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload).sort()
        : [],
    array_paths: arrays.map(({ path }) => path).slice(0, 20),
    array_count: arrays.length,
    object_row_count: objectRows.length,
    distinct_identifier_count: identifiers.size,
  };
}

async function probe(label: string, params: Record<string, string>) {
  const base = dataServiceBase();
  const token = String(process.env.AI_NOC_DATA_SERVICE_TOKEN ?? "").trim();
  if (!base || !token) {
    return {
      label,
      status: 0,
      configured: false,
      ...inspectPayload(null),
    };
  }

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
    return {
      label,
      status: response.status,
      configured: true,
      json: payload !== null,
      ...inspectPayload(payload),
    };
  } catch (error) {
    return {
      label,
      status: 0,
      configured: true,
      request_error: error instanceof Error ? error.name : "UnknownError",
      ...inspectPayload(null),
    };
  }
}

export async function GET() {
  // This diagnostic exists only to validate the v1.13 Preview data contract.
  // It must never become a production catalogue/read endpoint.
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const configured = Boolean(
    dataServiceBase() && String(process.env.AI_NOC_DATA_SERVICE_TOKEN ?? "").trim(),
  );
  if (!configured) {
    return NextResponse.json(
      {
        status: "source_unavailable",
        preview_only: true,
        configured: false,
        raw_rows_returned: false,
        identifiers_returned: false,
      },
      { status: 503 },
    );
  }

  const probes = await Promise.all([
    probe("no_identifier", { visibility: "internal", limit: "250" }),
    probe("wildcard_star", {
      identifier: "*",
      visibility: "internal",
      limit: "250",
    }),
    probe("wildcard_percent", {
      identifier: "%",
      visibility: "internal",
      limit: "250",
    }),
  ]);

  const authenticated = probes.some(
    (item) => item.status > 0 && item.status !== 401 && item.status !== 403,
  );
  const enumerationProbe = probes.find(
    (item) => item.distinct_identifier_count > 1,
  );

  return NextResponse.json({
    status: "ok",
    preview_only: true,
    configured: true,
    authenticated,
    enumeration_available: Boolean(enumerationProbe),
    enumeration_source: enumerationProbe?.label ?? null,
    distinct_identifier_count: enumerationProbe?.distinct_identifier_count ?? 0,
    probes,
    raw_rows_returned: false,
    identifiers_returned: false,
  });
}
