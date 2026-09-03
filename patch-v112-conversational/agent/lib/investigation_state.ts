import { defineState } from "eve/context";

export const INVESTIGATION_STAGES = [
  "intake",
  "evidence_loaded",
  "oem_checklist",
  "narrowing",
  "tenant_history",
  "fleet_history",
  "recommendation",
  "verification",
  "resolved",
  "escalation",
] as const;

export const INVESTIGATION_ENTRY_MODES = [
  "guided",
  "incident",
  "correlation",
  "resolution",
  "network",
  "operations",
  "learning",
] as const;

export type InvestigationStage = (typeof INVESTIGATION_STAGES)[number];
export type InvestigationEntryMode = (typeof INVESTIGATION_ENTRY_MODES)[number];

export interface InvestigationState {
  stage: InvestigationStage;
  entry_mode: InvestigationEntryMode;
  active_specialist: string | null;
  tenant_id: string | null;
  ticket_id: string | null;
  alarm_identifier: string | null;
  oem: string | null;
  model: string | null;
  alarm_text: string | null;
  symptoms: string[];
  completed_checks: string[];
  failed_checks: string[];
  not_applicable_checks: string[];
  observations: string[];
  active_hypotheses: string[];
  evidence_references: string[];
  skipped_stages: InvestigationStage[];
  evidence_pack_loaded: boolean;
  oem_playbook_loaded: boolean;
  oem_steps_attested_complete: boolean;
  tenant_history_used: boolean;
  fleet_history_used: boolean;
  recommended_action: string | null;
  resolution_status: "open" | "resolved" | "escalated";
  updated_at: string | null;
}

export const investigationState = defineState(
  "ai-noc.guided-investigation.v2",
  (): InvestigationState => ({
    stage: "intake",
    entry_mode: "guided",
    active_specialist: null,
    tenant_id: null,
    ticket_id: null,
    alarm_identifier: null,
    oem: null,
    model: null,
    alarm_text: null,
    symptoms: [],
    completed_checks: [],
    failed_checks: [],
    not_applicable_checks: [],
    observations: [],
    active_hypotheses: [],
    evidence_references: [],
    skipped_stages: [],
    evidence_pack_loaded: false,
    oem_playbook_loaded: false,
    oem_steps_attested_complete: false,
    tenant_history_used: false,
    fleet_history_used: false,
    recommended_action: null,
    resolution_status: "open",
    updated_at: null,
  }),
);
