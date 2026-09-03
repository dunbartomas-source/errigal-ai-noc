import { z } from "zod";
import { defineTool } from "eve/tools";
import {
  INVESTIGATION_ENTRY_MODES,
  INVESTIGATION_STAGES,
  investigationState,
} from "../lib/investigation_state";

const inputSchema = z
  .object({
    stage: z.enum(INVESTIGATION_STAGES).optional(),
    entry_mode: z.enum(INVESTIGATION_ENTRY_MODES).optional(),
    active_specialist: z.string().min(1).nullable().optional(),
    tenant_id: z.string().min(1).optional(),
    ticket_id: z.string().min(1).optional(),
    alarm_identifier: z.string().min(1).optional(),
    oem: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    alarm_text: z.string().min(1).optional(),
    symptoms: z.array(z.string()).optional(),
    completed_checks: z.array(z.string()).optional(),
    failed_checks: z.array(z.string()).optional(),
    not_applicable_checks: z.array(z.string()).optional(),
    observations: z.array(z.string()).optional(),
    active_hypotheses: z.array(z.string()).optional(),
    evidence_references: z.array(z.string()).optional(),
    skipped_stages: z.array(z.enum(INVESTIGATION_STAGES)).optional(),
    evidence_pack_loaded: z.boolean().optional(),
    oem_playbook_loaded: z.boolean().optional(),
    oem_steps_attested_complete: z.boolean().optional(),
    tenant_history_used: z.boolean().optional(),
    fleet_history_used: z.boolean().optional(),
    recommended_action: z.string().min(1).optional(),
    resolution_status: z.enum(["open", "resolved", "escalated"]).optional(),
    update_reason: z.string().min(1),
  })
  .strict();

export default defineTool({
  description:
    "Persist the current AI-NOC investigation stage, direct-entry mode, completed-stage attestation, and operator-confirmed facts for this Eve session. This writes only session workflow state; it never changes a network, device, alarm, or ticket.",
  inputSchema,
  execute: async (input) => {
    const updatedAt = new Date().toISOString();

    investigationState.update((current) => ({
      ...current,
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.entry_mode !== undefined ? { entry_mode: input.entry_mode } : {}),
      ...(input.active_specialist !== undefined
        ? { active_specialist: input.active_specialist }
        : {}),
      ...(input.tenant_id !== undefined ? { tenant_id: input.tenant_id } : {}),
      ...(input.ticket_id !== undefined ? { ticket_id: input.ticket_id } : {}),
      ...(input.alarm_identifier !== undefined
        ? { alarm_identifier: input.alarm_identifier }
        : {}),
      ...(input.oem !== undefined ? { oem: input.oem } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.alarm_text !== undefined ? { alarm_text: input.alarm_text } : {}),
      ...(input.symptoms !== undefined ? { symptoms: input.symptoms } : {}),
      ...(input.completed_checks !== undefined
        ? { completed_checks: input.completed_checks }
        : {}),
      ...(input.failed_checks !== undefined ? { failed_checks: input.failed_checks } : {}),
      ...(input.not_applicable_checks !== undefined
        ? { not_applicable_checks: input.not_applicable_checks }
        : {}),
      ...(input.observations !== undefined ? { observations: input.observations } : {}),
      ...(input.active_hypotheses !== undefined
        ? { active_hypotheses: input.active_hypotheses }
        : {}),
      ...(input.evidence_references !== undefined
        ? { evidence_references: input.evidence_references }
        : {}),
      ...(input.skipped_stages !== undefined
        ? { skipped_stages: input.skipped_stages }
        : {}),
      ...(input.evidence_pack_loaded !== undefined
        ? { evidence_pack_loaded: input.evidence_pack_loaded }
        : {}),
      ...(input.oem_playbook_loaded !== undefined
        ? { oem_playbook_loaded: input.oem_playbook_loaded }
        : {}),
      ...(input.oem_steps_attested_complete !== undefined
        ? { oem_steps_attested_complete: input.oem_steps_attested_complete }
        : {}),
      ...(input.tenant_history_used !== undefined
        ? { tenant_history_used: input.tenant_history_used }
        : {}),
      ...(input.fleet_history_used !== undefined
        ? { fleet_history_used: input.fleet_history_used }
        : {}),
      ...(input.recommended_action !== undefined
        ? { recommended_action: input.recommended_action }
        : {}),
      ...(input.resolution_status !== undefined
        ? { resolution_status: input.resolution_status }
        : {}),
      updated_at: updatedAt,
    }));

    return {
      saved: true,
      stage: input.stage,
      entry_mode: input.entry_mode,
      active_specialist: input.active_specialist,
      update_reason: input.update_reason,
      updated_at: updatedAt,
      safety: "session_state_only",
    };
  },
});
