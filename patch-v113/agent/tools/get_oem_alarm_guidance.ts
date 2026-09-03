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
});
