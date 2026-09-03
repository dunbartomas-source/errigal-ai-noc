import { defineState } from "eve/context";

export const ENTRY_MODES = [
  "full",
  "oem_troubleshooting",
  "context_investigation",
  "correlation",
  "resolution",
] as const;

export const INVESTIGATION_STAGES = [
  "intake",
  "oem_troubleshooting",
  "context_investigation",
  "correlation",
  "resolution",
  "verification",
  "resolved",
  "escalation",
] as const;

export const CHECK_STATUSES = [
  "completed_resolved",
  "completed_unresolved",
  "not_completed",
  "not_applicable",
  "unable",
  "unknown",
] as const;

export const STAGE_STATUSES = [
  "not_started",
  "active",
  "complete",
  "not_applicable",
  "operator_override",
  "not_required",
] as const;

export type EntryMode = (typeof ENTRY_MODES)[number];
export type InvestigationStage = (typeof INVESTIGATION_STAGES)[number];
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface InvestigationCheck {
  id: string;
  text: string;
  source_field?: string;
  status: CheckStatus;
  observation?: string;
}

export interface TimelineEvent {
  timestamp?: string | null;
  order_hint?: number | null;
  event_type: string;
  entity?: string | null;
  description: string;
  source_ref?: string | null;
}

export interface InvestigationState {
  schema_version: "1.13";
  investigation_id: string | null;
  entry_mode: EntryMode;
  current_stage: InvestigationStage;
  alarm_identifier: string | null;
  oem: string | null;
  trap_name: string | null;
  alarm_description: string | null;
  network_identifier: string | null;
  site: string | null;
  device: string | null;
  current_device_status: string | null;
  oem_guidance_loaded: boolean;
  checks: InvestigationCheck[];
  current_symptoms: string[];
  operator_observations: string[];
  active_alarms: string[];
  recent_alarms: string[];
  recent_changes: string[];
  timeline: TimelineEvent[];
  related_alarms: string[];
  ruled_out: string[];
  possible_relationships: string[];
  hypotheses: string[];
  stage_status: {
    oem_troubleshooting: StageStatus;
    context_investigation: StageStatus;
    correlation: StageStatus;
    resolution: StageStatus;
  };
  historical_evidence: string[];
  recommended_action: string | null;
  issue_status: "unknown" | "active" | "recovered" | "resolved" | "escalated";
  evidence_gaps: string[];
  source_refs: string[];
  updated_at: string | null;
}

export const investigationState = defineState(
  "ai-noc.universal-investigation.v113",
  (): InvestigationState => ({
    schema_version: "1.13",
    investigation_id: null,
    entry_mode: "full",
    current_stage: "intake",
    alarm_identifier: null,
    oem: null,
    trap_name: null,
    alarm_description: null,
    network_identifier: null,
    site: null,
    device: null,
    current_device_status: null,
    oem_guidance_loaded: false,
    checks: [],
    current_symptoms: [],
    operator_observations: [],
    active_alarms: [],
    recent_alarms: [],
    recent_changes: [],
    timeline: [],
    related_alarms: [],
    ruled_out: [],
    possible_relationships: [],
    hypotheses: [],
    stage_status: {
      oem_troubleshooting: "not_started",
      context_investigation: "not_started",
      correlation: "not_required",
      resolution: "not_started",
    },
    historical_evidence: [],
    recommended_action: null,
    issue_status: "unknown",
    evidence_gaps: [],
    source_refs: [],
    updated_at: null,
  }),
);
