import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";

const model = process.env.DEEPSEEK_API_KEY
  ? deepseek("deepseek-chat")
  : "deepseek/deepseek-v3.2";

export default defineAgent({
  description:
    "Analyse a compact AI-NOC incident timeline/topology envelope to determine whether multiple alarms or symptoms are likely related and what common-cause validation is most useful. Use only when correlation is genuinely required.",
  model,
  modelContextWindowTokens: 64000,
});
