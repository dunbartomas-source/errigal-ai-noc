import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";

const model = process.env.DEEPSEEK_API_KEY ? deepseek("deepseek-chat") : "deepseek/deepseek-v3.2";

export default defineAgent({
  description: "Errigal AI-NOC read-only orchestrator. For the default AI-NOC Copilot incident workflow, call one deterministic combined evidence pack and synthesize once; route focused requests to the appropriate specialist.",
  model,
  modelContextWindowTokens: 128000
});
