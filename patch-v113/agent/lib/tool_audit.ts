import { randomUUID } from "node:crypto";
import { defineState } from "eve/context";
import { investigationState } from "./investigation_state";

export type AuditSourceClass =
  | "internal_state"
  | "trap_knowledge"
  | "operational_context"
  | "historical_resolution";

export interface ToolAuditEvent {
  timestamp: string;
  investigation_id: string | null;
  stage: string | null;
  actor: string;
  tool: string;
  status: string;
  safe_row_count: number;
  latency_ms: number;
  source_class: AuditSourceClass;
  freshness: string;
  privacy_state: string;
}

interface ToolAuditState {
  schema_version: "1.13";
  events: ToolAuditEvent[];
}

const MAX_AUDIT_EVENTS = 100;

export const toolAuditState = defineState(
  "ai-noc.tool-audit.v113",
  (): ToolAuditState => ({
    schema_version: "1.13",
    events: [],
  }),
);

export function ensureInvestigationId(): string {
  const current = investigationState.get();
  if (current.investigation_id) return current.investigation_id;

  const investigationId = `inv-${randomUUID()}`;
  const now = new Date().toISOString();
  investigationState.update((state) => ({
    ...state,
    investigation_id: state.investigation_id ?? investigationId,
    updated_at: state.updated_at ?? now,
  }));
  return investigationState.get().investigation_id ?? investigationId;
}

function safeCount(value: unknown): number {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(Math.trunc(count), 1_000_000);
}

function safeLatency(startedAtMs: number): number {
  const latency = Date.now() - startedAtMs;
  if (!Number.isFinite(latency) || latency < 0) return 0;
  return Math.min(Math.trunc(latency), 3_600_000);
}

/**
 * Record metadata only. Never pass raw evidence, identifiers other than the
 * generated investigation id, prompts, notes, device names, ticket IDs, or
 * customer/site values into this function.
 *
 * Audit failures are deliberately non-blocking: telemetry must not prevent a
 * NOC investigation from proceeding.
 */
export function recordToolAudit(input: {
  actor: string;
  tool: string;
  status: string;
  started_at_ms: number;
  safe_row_count?: number;
  source_class: AuditSourceClass;
  freshness: string;
  privacy_state: string;
  stage?: string | null;
  investigation_id?: string | null;
  generate_investigation_id?: boolean;
}): ToolAuditEvent | null {
  try {
    const state = investigationState.get();
    const investigationId =
      input.investigation_id ??
      state.investigation_id ??
      (input.generate_investigation_id === false ? null : ensureInvestigationId());
    const current = investigationState.get();

    const event: ToolAuditEvent = {
      timestamp: new Date().toISOString(),
      investigation_id: investigationId,
      stage: input.stage ?? current.current_stage ?? null,
      actor: String(input.actor).slice(0, 80),
      tool: String(input.tool).slice(0, 120),
      status: String(input.status).slice(0, 80),
      safe_row_count: safeCount(input.safe_row_count),
      latency_ms: safeLatency(input.started_at_ms),
      source_class: input.source_class,
      freshness: String(input.freshness).slice(0, 120),
      privacy_state: String(input.privacy_state).slice(0, 120),
    };

    toolAuditState.update((audit) => ({
      ...audit,
      events: [...audit.events, event].slice(-MAX_AUDIT_EVENTS),
    }));
    return event;
  } catch {
    return null;
  }
}
