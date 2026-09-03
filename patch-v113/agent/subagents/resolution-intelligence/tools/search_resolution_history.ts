import { z } from "zod";
import { defineTool } from "eve/tools";
import { searchResolutionHistory } from "../../../lib/resolution_history_source";

export default defineTool({
  description:
    "Retrieve and group historical resolved incidents for an alarm identifier, marking resolution actions that resemble actions already attempted unsuccessfully. Read-only and privacy-minimised.",
  inputSchema: z
    .object({
      alarm_identifier: z.string().min(1),
      tenant_id: z.string().min(1).optional(),
      ticket_id: z.string().min(1).optional(),
      network_identifier: z.string().min(1).optional(),
      already_tried_actions: z.array(z.string()).optional(),
    })
    .strict(),
  execute: searchResolutionHistory,
});
