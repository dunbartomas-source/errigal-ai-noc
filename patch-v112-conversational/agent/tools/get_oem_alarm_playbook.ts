import { defineTool } from "eve/tools";
import { z } from "zod";
import { audit, DATA_AS_OF } from "../lib/audit";
import { getOemAlarmPlaybook } from "../lib/oem_playbook_source";

export default defineTool({
  description:
    "Look up the approved OEM alarm context, remedy information, and ordered troubleshooting steps for any alarm identifier present in the shared OEM table. The alarm identifier determines the OEM. Software or firmware version is intentionally not used for matching.",
  inputSchema: z
    .object({
      alarm_identifier: z.string().min(1),
    })
    .strict(),
  async execute(input) {
    const result = await getOemAlarmPlaybook(input.alarm_identifier);

    audit(
      "get_oem_alarm_playbook",
      "shared_oem",
      result.source,
      result.source_row_count,
      { warningCount: result.warnings.length, main: true },
    );

    return {
      ...result,
      data_as_of: result.source === "keystats_table" ? null : DATA_AS_OF,
      workflow_use:
        result.status === "success"
          ? "Present these approved steps to the operator and record what has already been completed before consulting historical resolutions."
          : "Do not invent troubleshooting steps. State the documentation gap and ask for a valid alarm identifier or escalate the missing playbook.",
    };
  },
});
