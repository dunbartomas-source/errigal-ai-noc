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
});
