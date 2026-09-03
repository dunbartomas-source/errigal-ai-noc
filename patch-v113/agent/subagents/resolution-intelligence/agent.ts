import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";

const model = process.env.DEEPSEEK_API_KEY
  ? deepseek("deepseek-chat")
  : "deepseek/deepseek-v3.2";

export default defineAgent({
  description:
    "Use historical resolved incident evidence to rank the strongest next action after OEM/context investigation is complete or validly bypassed. Deprioritize actions already tried and never present historical similarity as proof.",
  model,
  modelContextWindowTokens: 64000,
});
