import { z } from "zod";
import { defineTool } from "eve/tools";
import { investigationState } from "../lib/investigation_state";

export default defineTool({
  description:
    "Read the durable v1.13 AI-NOC investigation state for the current Eve session. Use when resuming or when the current stage/check status is unclear.",
  inputSchema: z.object({}).strict(),
  execute: async () => ({
    status: "success",
    read_only: true,
    state: investigationState.get(),
  }),
  toModelOutput(output: any) {
    const state = output.state ?? {};
    return {
      type: "json" as const,
      value: {
        status: output.status,
        investigation_id: state.investigation_id,
        entry_mode: state.entry_mode,
        current_stage: state.current_stage,
        issue_status: state.issue_status,
        alarm_identifier: state.alarm_identifier,
        oem: state.oem,
        trap_name: state.trap_name,
        network_identifier: state.network_identifier,
        site: state.site,
        device: state.device,
        current_device_status: state.current_device_status,
        oem_guidance_loaded: state.oem_guidance_loaded,
        checks: Array.isArray(state.checks)
          ? state.checks.map((check: any) => ({
              id: check.id,
              text: String(check.text ?? "").slice(0, 180),
              status: check.status,
              observation: check.observation ? String(check.observation).slice(0, 180) : null,
            }))
          : [],
        current_symptoms: Array.isArray(state.current_symptoms)
          ? state.current_symptoms.slice(0, 8)
          : [],
        operator_observations: Array.isArray(state.operator_observations)
          ? state.operator_observations.slice(-8)
          : [],
        related_alarms: Array.isArray(state.related_alarms)
          ? state.related_alarms.slice(0, 12)
          : [],
        ruled_out: Array.isArray(state.ruled_out) ? state.ruled_out.slice(0, 10) : [],
        stage_status: state.stage_status,
        recommended_action: state.recommended_action,
        evidence_gaps: Array.isArray(state.evidence_gaps)
          ? state.evidence_gaps.slice(0, 10)
          : [],
        evidence_counts: {
          active_alarms: Array.isArray(state.active_alarms) ? state.active_alarms.length : 0,
          recent_alarms: Array.isArray(state.recent_alarms) ? state.recent_alarms.length : 0,
          recent_changes: Array.isArray(state.recent_changes) ? state.recent_changes.length : 0,
          timeline_events: Array.isArray(state.timeline) ? state.timeline.length : 0,
          historical_items: Array.isArray(state.historical_evidence)
            ? state.historical_evidence.length
            : 0,
        },
      },
    };
  },
});
