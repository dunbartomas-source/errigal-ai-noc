import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "agent/agent.ts",
  "agent/instructions.md",
  "agent/lib/investigation_state.ts",
  "agent/lib/oem_playbook_source.ts",
  "agent/lib/resolution_history_source.ts",
  "agent/tools/agent.ts",
  "agent/tools/get_oem_alarm_guidance.ts",
  "agent/tools/get_universal_context.ts",
  "agent/tools/get_investigation_state.ts",
  "agent/tools/update_investigation_state.ts",
  "agent/skills/oem-guided-troubleshooting.md",
  "agent/skills/universal-context-investigation.md",
  "agent/skills/resolution-validation.md",
  "agent/subagents/correlation-root-cause/agent.ts",
  "agent/subagents/resolution-intelligence/agent.ts",
  "agent/subagents/resolution-intelligence/tools/search_resolution_history.ts",
  "app/page.tsx",
  "app/investigate/investigation-chat.tsx",
];

for (const path of requiredFiles) {
  if (!existsSync(path)) throw new Error(`V113_SOURCE_MISSING ${path}`);
}

for (const removed of [
  "agent/subagents/incident-investigation",
  "agent/subagents/troubleshooting-resolution",
]) {
  if (existsSync(removed)) throw new Error(`V113_DEPRECATED_SUBAGENT_PRESENT ${removed}`);
}

const instructions = readFileSync("agent/instructions.md", "utf8");
for (const marker of [
  "Ask systems before humans",
  "correlation-root-cause",
  "resolution-intelligence",
  "Software version may matter later",
  "Use at most one specialist subagent",
]) {
  if (!instructions.includes(marker)) throw new Error(`V113_INSTRUCTION_MISSING ${marker}`);
}

const disabledAgent = readFileSync("agent/tools/agent.ts", "utf8");
if (!disabledAgent.includes("disableTool")) throw new Error("V113_GENERIC_AGENT_NOT_DISABLED");

const chat = readFileSync("app/investigate/investigation-chat.tsx", "utf8");
for (const marker of [
  "Full AI-NOC Investigation",
  "OEM Troubleshooting",
  "Investigate Network Context",
  "Correlate Alarms",
  "Find Past Resolutions",
  "completed_resolved",
  "completed_unresolved",
]) {
  if (!chat.includes(marker)) throw new Error(`V113_UI_MISSING ${marker}`);
}

const stateTool = readFileSync("agent/tools/update_investigation_state.ts", "utf8");
for (const prohibited of ["exec(", "acknowledgeAlarm", "closeTicket", "restartDevice"]) {
  if (stateTool.includes(prohibited)) throw new Error(`V113_STATE_SAFETY_VIOLATION ${prohibited}`);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.version !== "1.13.0") throw new Error(`V113_PACKAGE_VERSION ${pkg.version}`);

console.log("V113_SOURCE_OK architecture=one-main-agent+skills+two-specialists mode=read_only");
