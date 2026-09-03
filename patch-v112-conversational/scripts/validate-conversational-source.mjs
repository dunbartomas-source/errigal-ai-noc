import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "agent/lib/investigation_state.ts",
  "agent/tools/update_investigation_state.ts",
  "agent/skills/guided-investigation.md",
  "app/investigate/page.tsx",
  "app/investigate/investigation-chat.tsx",
  "app/investigate/investigation-chat.module.css",
];

for (const path of requiredFiles) {
  if (!existsSync(path)) throw new Error(`CONVERSATIONAL_SOURCE_MISSING ${path}`);
}

const instructions = readFileSync("agent/instructions.md", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
const chat = readFileSync("app/investigate/investigation-chat.tsx", "utf8");
const stateTool = readFileSync("agent/tools/update_investigation_state.ts", "utf8");

for (const marker of [
  "Conversational guided investigation (v1.12)",
  "AI_NOC_CHECKLIST",
  "ANONYMIZED FLEET PATTERN",
  "The Copilot is read-only",
]) {
  if (!instructions.includes(marker)) {
    throw new Error(`CONVERSATIONAL_INSTRUCTION_MISSING ${marker}`);
  }
}

if (!page.includes("Start a guided AI-NOC investigation")) {
  throw new Error("CONVERSATIONAL_LAUNCH_PROMPT_MISSING");
}

if (!chat.includes("useEveAgent") || !chat.includes("AI_NOC_CHECKLIST")) {
  throw new Error("CONVERSATIONAL_CHAT_UI_INVALID");
}

for (const prohibited of ["fetch(", "exec(", "acknowledgeAlarm", "closeTicket", "restartDevice"]) {
  if (stateTool.includes(prohibited)) {
    throw new Error(`STATE_TOOL_SAFETY_VIOLATION ${prohibited}`);
  }
}

console.log("CONVERSATIONAL_SOURCE_OK version=1.12.0 route=/investigate mode=read_only");
