import { z } from "zod";
import { defineDynamic, defineTool } from "eve/tools";
import { getCopilotIncidentCase } from "../lib/copilot_source";
import { investigationState } from "../lib/investigation_state";
import { ensureInvestigationId, recordToolAudit } from "../lib/tool_audit";

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

function latestUserText(messages: any[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) => (part?.type === "text" ? String(part.text ?? "") : ""))
        .join("\n");
    }
  }
  return "";
}

function entryModeFromText(text: string) {
  const match = text.match(
    /ENTRY_MODE:\s*(full|oem_troubleshooting|context_investigation|correlation|resolution)/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function userSuppliedAlarmIdentifier(text: string): boolean {
  return /alarm\s+identifier\s+(?:is\s+)?[A-Za-z0-9._:-]+/i.test(text);
}

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

export default defineDynamic({
  events: {
    "step.started": async (_event, ctx) => {
      const text = latestUserText(ctx.messages as any[]);
      const explicitEntryMode = entryModeFromText(text);
      const state = investigationState.get();
      const effectiveEntryMode = explicitEntryMode ?? state.entry_mode;
      const oemComplete = ["complete", "not_applicable", "operator_override"].includes(
        state.stage_status.oem_troubleshooting,
      );
      const knownAlarm = Boolean(state.alarm_identifier) || userSuppliedAlarmIdentifier(text);

      // OEM-first is a runtime gate, not merely a prompt preference. A full/OEM
      // investigation with a known alarm cannot access downstream context until
      // OEM troubleshooting is complete or intentionally bypassed.
      if (
        (effectiveEntryMode === "full" || effectiveEntryMode === "oem_troubleshooting") &&
        knownAlarm &&
        !oemComplete
      ) {
        return null;
      }

      // Direct Resolution should not spend credits re-running context collection
      // on the entry turn; it either accepts an attestation/override or asks the
      // operator whether to return to the earlier stages.
      if (explicitEntryMode === "resolution") return null;

      return defineTool({
        description:
          "Build universal read-only incident context from a ticket_id, network_identifier, OR alarm_identifier alone. Use for direct Context/Correlation, or to derive missing incident identity before OEM troubleshooting. Returns current facts, recent alarm/change evidence, topology/dependencies, related tickets, ordered timeline and explicit evidence gaps. Excludes historical resolution intelligence.",
        inputSchema,
        execute: async (input) => {
          const startedAt = Date.now();
          const investigationId = ensureInvestigationId();
          const tenant = input.tenant_id?.trim() || "customer-a";
          const lookup =
            input.ticket_id?.trim() ||
            input.network_identifier?.trim() ||
            input.alarm_identifier!.trim();
          const result = await getCopilotIncidentCase(
            tenant,
            lookup,
            input.alarm_identifier?.trim(),
          );

          if (result.status !== "success" || !result.case_data) {
            recordToolAudit({
              actor: "ai-noc-investigator",
              tool: "get_universal_context",
              status: result.status,
              started_at_ms: startedAt,
              safe_row_count: 0,
              source_class: "operational_context",
              freshness: "requested_alarms_14d_changes_7d",
              privacy_state: "metadata_only_no_raw_evidence_logged",
              investigation_id: investigationId,
              stage: "context_investigation",
            });
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
          const sequenceRows = Array.isArray(data?.correlation?.sequence)
            ? data.correlation.sequence
            : [];
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

          const alarmIdentifiers = [
            ...new Set(timeline.map((event) => event.raw_alarm_identifier).filter(Boolean)),
          ];
          const relatedTickets = [
            ...new Set(
              alarmRows
                .map((row: any) => firstValue(row, ["ticket_id", "ticket"]))
                .filter(Boolean),
            ),
          ];
          const changes = changeRows.slice(0, 25).map((row: any) => ({
            timestamp: eventTimestamp(row),
            type: firstValue(row, ["change_type", "type"], "change"),
            description: eventDescription(row),
          }));
          const networkIdentifier =
            input.network_identifier?.trim() ||
            firstValue(incident, ["network_identifier", "device_name", "site_name"]);

          const gaps: string[] = [];
          if (!changeRows.length) {
            gaps.push(
              "Recent software/configuration changes are not available from the current adapter.",
            );
          }
          if (
            !Array.isArray(data?.correlation?.dependencies) ||
            !data.correlation.dependencies.length
          ) {
            gaps.push("No topology/dependency evidence is available from the current adapter.");
          }

          const output = {
            status: "success" as const,
            read_only: true as const,
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
            correlation_required_hint: Boolean(
              data?.deterministic_assessment?.correlation_required,
            ),
            timeline: timeline.map(({ raw_alarm_identifier: _raw, ...event }) => event),
            evidence_gaps: gaps,
            warnings: result.warnings,
          };

          investigationState.update((current) => ({
            ...current,
            entry_mode: (explicitEntryMode as any) ?? current.entry_mode,
            alarm_identifier:
              output.incident.alarm_identifier ?? current.alarm_identifier,
            oem: output.incident.oem ?? current.oem,
            trap_name: output.incident.trap_name ?? current.trap_name,
            network_identifier: output.network_identifier ?? current.network_identifier,
            site: output.incident.site_name ?? current.site,
            device: output.incident.device_name ?? current.device,
            current_device_status: output.incident.status ?? current.current_device_status,
            related_alarms: output.related_alarm_identifiers.map(String),
            recent_changes: output.recent_changes.map((change: any) =>
              [change.timestamp, change.type, change.description].filter(Boolean).join(" | "),
            ),
            timeline: output.timeline,
            evidence_gaps: [...new Set([...current.evidence_gaps, ...output.evidence_gaps])],
            updated_at: new Date().toISOString(),
          }));

          recordToolAudit({
            actor: "ai-noc-investigator",
            tool: "get_universal_context",
            status: "success",
            started_at_ms: startedAt,
            safe_row_count:
              output.recent_alarm_events.length +
              output.recent_changes.length +
              output.topology_dependencies.length,
            source_class: "operational_context",
            freshness: `alarms_${input.recent_alarm_days}d_changes_${input.recent_change_days}d`,
            privacy_state: "metadata_only_no_raw_evidence_logged",
            investigation_id: investigationId,
            stage: "context_investigation",
          });

          return output;
        },
        toModelOutput(output: any) {
          if (output.status !== "success") {
            return {
              type: "json" as const,
              value: {
                status: output.status,
                evidence_class: output.evidence_class,
                warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
              },
            };
          }

          return {
            type: "json" as const,
            value: {
              status: output.status,
              evidence_class: output.evidence_class,
              source: output.source,
              requested_windows: output.requested_windows,
              incident: output.incident,
              network_identifier: output.network_identifier,
              related_alarm_identifiers: Array.isArray(output.related_alarm_identifiers)
                ? output.related_alarm_identifiers.slice(0, 20)
                : [],
              related_tickets: Array.isArray(output.related_tickets)
                ? output.related_tickets.slice(0, 10)
                : [],
              recent_changes: Array.isArray(output.recent_changes)
                ? output.recent_changes.slice(0, 10)
                : [],
              topology_dependencies: Array.isArray(output.topology_dependencies)
                ? output.topology_dependencies.slice(0, 10)
                : [],
              correlation_required_hint: output.correlation_required_hint,
              timeline: Array.isArray(output.timeline)
                ? output.timeline.slice(0, 35).map((event: any) => ({
                    timestamp: event.timestamp ?? null,
                    event_type: event.event_type,
                    entity: event.entity ?? null,
                    description: String(event.description ?? "").slice(0, 240),
                  }))
                : [],
              evidence_gaps: Array.isArray(output.evidence_gaps)
                ? output.evidence_gaps.slice(0, 10)
                : [],
              evidence_counts: {
                raw_alarm_events: Array.isArray(output.recent_alarm_events)
                  ? output.recent_alarm_events.length
                  : 0,
                timeline_events: Array.isArray(output.timeline) ? output.timeline.length : 0,
                topology_dependencies: Array.isArray(output.topology_dependencies)
                  ? output.topology_dependencies.length
                  : 0,
              },
              warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
            },
          };
        },
      });
    },
  },
});
