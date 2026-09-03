import { z } from "zod";
import { defineTool } from "eve/tools";
import { getOemAlarmPlaybook } from "../lib/oem_playbook_source";

export default defineTool({
  description:
    "Read the controlled OEM alarm guidance for one alarm identifier. Alarm identifier is the matching key; software/firmware version is intentionally not required. Never use this tool for fuzzy matching.",
  inputSchema: z.object({ alarm_identifier: z.string().min(1) }).strict(),
  execute: async ({ alarm_identifier }) => {
    const result = await getOemAlarmPlaybook(alarm_identifier);
    if (result.status !== "success") return result;

    return {
      ...result,
      checklist: result.troubleshooting_steps.map((step) => ({
        id: step.id,
        text: step.instruction,
        source_field: step.source_field,
      })),
      evidence_class: "structured_oem_guidance",
    };
  },
  toModelOutput(output: any) {
    if (output.status !== "success") {
      return {
        type: "json" as const,
        value: {
          status: output.status,
          alarm_identifier: output.alarm_identifier,
          warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
          matching_policy: output.matching_policy,
        },
      };
    }

    return {
      type: "json" as const,
      value: {
        status: output.status,
        evidence_class: output.evidence_class,
        alarm_identifier: output.alarm_identifier,
        canonical_alarm_identifier: output.canonical_alarm_identifier,
        oem: output.oem,
        alarm_context: Array.isArray(output.alarm_context)
          ? output.alarm_context.slice(0, 6)
          : [],
        remedy_information: Array.isArray(output.remedy_information)
          ? output.remedy_information.slice(0, 6)
          : [],
        checklist: Array.isArray(output.checklist)
          ? output.checklist.slice(0, 20).map((item: any) => ({
              id: item.id,
              text: String(item.text ?? "").slice(0, 500),
              source_field: item.source_field,
            }))
          : [],
        source_row_count: output.source_row_count,
        matching_policy: output.matching_policy,
        warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
      },
    };
  },
});
