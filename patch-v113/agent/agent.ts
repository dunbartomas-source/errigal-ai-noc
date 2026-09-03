import { deepseek } from "@ai-sdk/deepseek";
import { defineAgent } from "eve";

const model = process.env.DEEPSEEK_API_KEY
  ? deepseek("deepseek-chat")
  : "deepseek/deepseek-v3.2";

export default defineAgent({
  description:
    "Errigal AI-NOC Investigator: one durable read-only conversational agent that uses typed tools for facts, Skills for approved procedures, and only the Correlation and Resolution Intelligence specialists when isolated reasoning materially helps.",
  model,
  modelContextWindowTokens: 128000,
});
