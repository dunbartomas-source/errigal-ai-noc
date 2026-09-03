import { z } from "zod";
import { defineTool } from "eve/tools";
import { searchResolutionHistory } from "../../../lib/resolution_history_source";

export default defineTool({
  description:
    "Retrieve anonymized historical resolution evidence for an alarm identifier. Returns aggregate fleet patterns and sanitized technical examples only; never returns cross-customer ticket IDs or identifying customer/site/device details. Marks actions that resemble actions already attempted unsuccessfully.",
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
