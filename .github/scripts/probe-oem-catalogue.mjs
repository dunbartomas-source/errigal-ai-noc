const serviceBase = String(
  process.env.AI_NOC_LIVE_DATA_SERVICE_URL ||
    "https://errigal-ai-noc-data-service.vercel.app",
).replace(/\/$/, "");

const timeoutMs = Number(process.env.OEM_PROBE_TIMEOUT_MS || 15000);

function arraysInPayload(payload) {
  const arrays = [];
  const seen = new Set();

  function visit(value, path = "root") {
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

function rowIdentifier(row) {
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
      return String(value).trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
    }
  }
  return "";
}

function inspectPayload(payload) {
  const topLevelKeys =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.keys(payload).sort()
      : [];
  const arrays = arraysInPayload(payload);
  const objectRows = arrays.flatMap(({ rows }) =>
    rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)),
  );
  const identifiers = new Set(objectRows.map(rowIdentifier).filter(Boolean));
  return {
    topLevelKeys,
    arrayPaths: arrays.map(({ path }) => path).slice(0, 20),
    arrayCount: arrays.length,
    objectRowCount: objectRows.length,
    distinctIdentifierCount: identifiers.size,
    identifiers,
  };
}

async function request(label, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL("/api/lookup", serviceBase);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const inspected = inspectPayload(payload);
    console.log(
      `OEM_PROBE label=${label} status=${response.status} json=${payload !== null} top_keys=${inspected.topLevelKeys.join(",") || "none"} arrays=${inspected.arrayCount} object_rows=${inspected.objectRowCount} distinct_ids=${inspected.distinctIdentifierCount}`,
    );
    return { label, status: response.status, payload, inspected };
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.log(`OEM_PROBE label=${label} request_error=${name}`);
    return { label, status: 0, payload: null, inspected: inspectPayload(null) };
  } finally {
    clearTimeout(timer);
  }
}

const probes = [];
probes.push(await request("known_reference", { identifier: "9618", visibility: "internal", limit: "5" }));
probes.push(await request("no_identifier", { visibility: "internal", limit: "250" }));
probes.push(await request("wildcard_star", { identifier: "*", visibility: "internal", limit: "250" }));
probes.push(await request("wildcard_percent", { identifier: "%", visibility: "internal", limit: "250" }));

const known = probes.find((probe) => probe.label === "known_reference");
const catalogueProbe = probes.find(
  (probe) => probe.label !== "known_reference" && probe.inspected.distinctIdentifierCount > 1,
);

if (!known || known.status < 200 || known.status >= 500) {
  console.error("OEM_LIVE_SERVICE_UNHEALTHY known_reference_lookup_failed");
  process.exit(1);
}

if (!catalogueProbe) {
  console.log(
    "OEM_CATALOGUE_ENUMERATION unavailable=true action=add_read_only_catalogue_endpoint raw_rows_logged=false identifiers_logged=false",
  );
  process.exit(0);
}

console.log(
  `OEM_CATALOGUE_ENUMERATION available=true source_probe=${catalogueProbe.label} distinct_ids=${catalogueProbe.inspected.distinctIdentifierCount} raw_rows_logged=false identifiers_logged=false`,
);
