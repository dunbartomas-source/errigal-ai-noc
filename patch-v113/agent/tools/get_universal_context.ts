import { z } from "zod";
import { defineTool } from "eve/tools";
import { getCopilotIncidentCase } from "../lib/copilot_source";

const inputSchema = z
  .object({
    tenant_id: z.string().min(1).optional(),
    ticket_id: z.string().min(1).optional(),
    alarm_identifier: z.string().min(1).optional(),
    network_identifier: z.string().min(1).optional(),
    recent_alarm_days: z.number().int().min(1).max(90).default(14),
    recent_change_days: z.number().int().min(1).max(30).default(7),
  })
  .refine(
    (value) => Boolean(value.ticket_id || value.alarm_identifier || value.network_identifier),
    { message: "Provide ticket_id, alarm_identifier, or network_identifier" },
  );

function firstValue(row: any, keys: string[], fallback: string | null = null): string | null {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function eventTimestamp(row: any): string | null {
  return firstValue(row, [
    "timestamp",
    "event_time",
    "created_at",
    "createdAt",
    "alarm_created_at",
    "alarm_date",
    "date",
    "time",
  ]);
}

function eventDescription(row: any): string {
  return (
    firstValue(row, ["description", "summary", "alarm_identifier", "trap_name", "event_type"]) ??
    "Network event"
  );
}

function normalizeEvents(rows: any[], eventType: string) {
  return rows.map((row, index) => ({
    timestamp: eventTimestamp(row),
    order_hint: Number.isFinite(Number(row?.offset_seconds)) ? Number(row.offset_seconds) : index,
    event_type: firstValue(row, ["event_type", "type"], eventType) ?? eventType,
    entity: firstValue(row, ["device_name", "network_element", "entity", "parent", "child"]),
    description: eventDescription(row),
    source_ref: firstValue(row, ["ticket_id", "event_id", "alarm_id"]),
    raw_alarm_identifier: firstValue(row, ["alarm_identifier", "alarm_ident_key"]),
  }));
}

function sortTimeline(events: any[]) {
  return events.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      const delta = Date.parse(a.timestamp) - Date.parse(b.timestamp);
      if (Number.isFinite(delta) && delta !== 0) return delta;
    }
    return Number(a.order_hint ?? 0) - Number(b.order_hint ?? 0);
  });
}

export default defineTool({
  description:
    "Build the universal read-only incident context from a ticket_id, network_identifier, OR alarm_identifier alone. If the user already supplied an alarm identifier, call this tool immediately; do not ask for a network ID first. Returns current incident/device facts, recent alarm events, available software/configuration changes, topology/dependencies, related tickets, an ordered timeline, and explicit evidence gaps. It deliberately excludes historical resolution intelligence.",
  inputSchema,
  execute: async (input) => {
    const tenant = input.tenant_id?.trim() || "customer-a";
    const lookup = input.ticket_id?.trim() || input.network_identifier?.trim() || input.alarm_identifier!.trim();
    const result = await getCopilotIncidentCase(tenant, lookup, input.alarm_identifier?.trim());

    if (result.status !== "success" || !result.case_data) {
      return {
        status: result.status,
        read_only: true,
        evidence_class: "current_operational_context",
        warnings: result.warnings,
      };
    }

    const data: any = result.case_data;
    const incident = data.incident ?? {};
    const alarmRows = Array.isArray(data.related_events) ? data.related_events : [];
    const sequenceRows = Array.isArray(data?.correlation?.sequence) ? data.correlation.sequence : [];
    const changeRows = Array.isArray(data?.recent_changes)
      ? data.recent_changes
      : Array.isArray(data?.changes)
        ? data.changes
        : [];

    const timeline = sortTimeline([
      ...normalizeEvents(alarmRows, "alarm"),
      ...normalizeEvents(sequenceRows, "alarm_sequence"),
      ...normalizeEvents(changeRows, "change"),
    ]).slice(0, 100);

    const alarmIdentifiers = [...new Set(
      timeline.map((event) => event.raw_alarm_identifier).filter(Boolean),
    )];

    const relatedTickets = [...new Set(
      alarmRows.map((row: any) => firstValue(row, ["ticket_id", "ticket"])) .filter(Boolean),
    )];

    const changes = changeRows.slice(0, 25).map((row: any) => ({
      timestamp: eventTimestamp(row),
      type: firstValue(row, ["change_type", "type"], "change"),
      description: eventDescription(row),
    }));

    const networkIdentifier =
      input.network_identifier?.trim() ||
      firstValue(incident, ["network_identifier", "device_name", "site_name"]);

    const gaps: string[] = [];
    if (!changeRows.length) gaps.push("Recent software/configuration changes are not available from the current adapter.");
    if (!Array.isArray(data?.correlation?.dependencies) || !data.correlation.dependencies.length) {
      gaps.push("No topology/dependency evidence is available from the current adapter.");
    }

    return {
      status: "success",
      read_only: true,
      evidence_class: "current_operational_context",
      source: result.source,
      requested_windows: {
        recent_alarm_days: input.recent_alarm_days,
        recent_change_days: input.recent_change_days,
      },
      incident: {
        ticket_id: firstValue(incident, ["ticket_id", "ticket"]),
        alarm_identifier: firstValue(incident, ["alarm_identifier"]),
        trap_name: firstValue(incident, ["trap_name"]),
        oem: firstValue(incident, ["oem", "vendor"]),
        technology: firstValue(incident, ["technology", "technology_type"]),
        device_model: firstValue(incident, ["device_model", "model"]),
        software_version: firstValue(incident, ["software_version", "version"]),
        device_name: firstValue(incident, ["device_name", "network_element"]),
        site_name: firstValue(incident, ["site_name", "site"]),
        status: firstValue(incident, ["status", "device_status"]),
      },
      network_identifier: networkIdentifier,
      recent_alarm_events: alarmRows.slice(0, 50),
      related_alarm_identifiers: alarmIdentifiers,
      related_tickets: relatedTickets,
      recent_changes: changes,
      topology_dependencies: Array.isArray(data?.correlation?.dependencies)
        ? data.correlation.dependencies.slice(0, 30)
        : [],
      correlation_required_hint: Boolean(data?.deterministic_assessment?.correlation_required),
      timeline: timeline.map(({ raw_alarm_identifier: _raw, ...event }) => event),
      evidence_gaps: gaps,
      warnings: result.warnings,
    };
  },
});
