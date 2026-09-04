import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";

const release = "1.13.0";

function copyFile(source, target) {
  if (!existsSync(source)) throw new Error(`V113_PATCH_SOURCE_MISSING ${source}`);
  const slash = target.lastIndexOf("/");
  if (slash > 0) mkdirSync(target.slice(0, slash), { recursive: true });
  writeFileSync(target, readFileSync(source, "utf8"));
}

// Reuse only the existing conversational shell as scaffolding. The data/OEM
// contracts are v1.13-owned and applied below rather than inherited from v1.12.
for (const [source, target] of [
  ["patch-v112-conversational/app/investigate/page.tsx", "app/investigate/page.tsx"],
  ["patch-v112-conversational/app/investigate/investigation-chat.tsx", "app/investigate/investigation-chat.tsx"],
  ["patch-v112-conversational/app/investigate/investigation-chat.module.css", "app/investigate/investigation-chat.module.css"],
]) {
  copyFile(source, target);
}

const v113Paths = [
  "agent/agent.ts",
  "agent/instructions.md",
  "agent/lib/investigation_state.ts",
  "agent/lib/tool_audit.ts",
  "agent/lib/copilot_source.ts",
  "agent/lib/oem_playbook_source.ts",
  "agent/lib/resolution_history_source.ts",
  "agent/tools/agent.ts",
  "agent/tools/get_investigation_state.ts",
  "agent/tools/update_investigation_state.ts",
  "agent/tools/get_oem_alarm_guidance.ts",
  "agent/tools/get_universal_context.ts",
  "agent/skills/oem-guided-troubleshooting.md",
  "agent/skills/universal-context-investigation.md",
  "agent/skills/resolution-validation.md",
  "agent/skills/incident-handover.md",
  "agent/skills/oem-escalation.md",
  "agent/subagents/correlation-root-cause/agent.ts",
  "agent/subagents/correlation-root-cause/instructions.md",
  "agent/subagents/resolution-intelligence/agent.ts",
  "agent/subagents/resolution-intelligence/instructions.md",
  "agent/subagents/resolution-intelligence/tools/search_resolution_history.ts",
  "app/page.tsx",
  "app/lib/supabase-browser.ts",
  "app/api/health/route.ts",
  "app/api/internal/oem-catalogue-check/route.ts",
  "app/api/internal/oem-catalogue-coverage/route.ts",
  "scripts/validate-v113-source.mjs",
  "tsconfig.json",
];

for (const path of v113Paths) copyFile(`patch-v113/${path}`, path);

// Remove framework defaults that are not part of the approved read-only NOC surface.
// ask_question is intentionally disabled: UI questions are normal assistant turns/markers,
// avoiding parked Eve input requests that complicate deterministic investigation state.
const disabledBuiltins = [
  "bash",
  "read_file",
  "write_file",
  "web_fetch",
  "web_search",
  "todo",
  "ask_question",
];
const disabledScopes = [
  "agent/tools",
  "agent/subagents/correlation-root-cause/tools",
  "agent/subagents/resolution-intelligence/tools",
];
for (const scope of disabledScopes) {
  for (const tool of disabledBuiltins) {
    copyFile(`patch-v113/${scope}/${tool}.ts`, `${scope}/${tool}.ts`);
  }
}

// v1.13 exposes only the capabilities required by the universal conversational architecture.
const inactiveCapabilityPaths = [
  "agent/subagents/incident-investigation",
  "agent/subagents/troubleshooting-resolution",
  "agent/subagents/network-intelligence",
  "agent/subagents/noc-operations",
  "agent/subagents/knowledge-learning",
  "agent/subagents/correlation-root-cause/tools/get_root_cause_evidence_pack.ts",
  "agent/tools/build_guided_escalation_packet.ts",
  "agent/tools/get_copilot_incident_evidence_pack.ts",
  "agent/tools/get_guided_correlation_assessment.ts",
  "agent/tools/get_guided_investigation_state.ts",
  "agent/tools/get_local_resolution_intelligence.ts",
  "agent/tools/get_shared_resolution_intelligence.ts",
  "agent/tools/record_guided_investigation_outcome.ts",
  "agent/tools/record_guided_observation.ts",
  "agent/tools/record_investigation_checks.ts",
  "agent/tools/start_guided_investigation.ts",
  "agent/skills/power-fault-troubleshooting.md",
  "agent/skills/communication-loss-troubleshooting.md",
  "agent/lib/guided_investigation_state.ts",
];

for (const path of inactiveCapabilityPaths) {
  rmSync(path, { recursive: true, force: true });
}

// Adapt the existing chat shell into the universal v1.13 entry experience.
const chatPath = "app/investigate/investigation-chat.tsx";
let chat = readFileSync(chatPath, "utf8");
chat = chat.replace(
  /const STARTERS = \[[\s\S]*?\] as const;/,
  `const STARTERS = [\n  {\n    title: \"OEM Troubleshooting\",\n    description: \"Start with controlled OEM alarm guidance and record what has already been tried.\",\n    prompt: \"ENTRY_MODE: oem_troubleshooting. Start directly at OEM troubleshooting. Ask me for the alarm identifier if it is missing.\",\n  },\n  {\n    title: \"Investigate Network Context\",\n    description: \"Check recent alarms, system state, topology, software/config changes and missing evidence.\",\n    prompt: \"ENTRY_MODE: context_investigation. Start directly at the universal network-context investigation stage. Ask for a network/system identifier if it is missing. Do not replay OEM troubleshooting unless it becomes necessary.\",\n  },\n  {\n    title: \"Correlate Alarms\",\n    description: \"Analyse timing, topology and shared dependencies only when several events may be related.\",\n    prompt: \"ENTRY_MODE: correlation. Start directly with alarm correlation. Ask for the smallest identifier set required, gather deterministic context, then use the Correlation & Root Cause Analyst once.\",\n  },\n  {\n    title: \"Find Past Resolutions\",\n    description: \"Skip completed stages and compare real resolved cases without replaying unnecessary workflows.\",\n    prompt: \"ENTRY_MODE: resolution. Start directly at Resolution Intelligence. First confirm whether OEM troubleshooting and basic network-context investigation are complete unless I already supplied that attestation.\",\n  },\n] as const;`,
);
chat = chat.replace(
  /const CHECK_STATUSES = \[[\s\S]*?\] as const;/,
  `const CHECK_STATUSES = [\n  [\"completed_resolved\", \"Completed - issue resolved\"],\n  [\"completed_unresolved\", \"Completed - issue still present\"],\n  [\"not_completed\", \"Not completed\"],\n  [\"not_applicable\", \"Not applicable\"],\n  [\"unable\", \"Unable to complete / unsure\"],\n] as const;`,
);
chat = chat
  .replace("Guided Investigation", "Universal Investigation")
  .replace("AI-NOC COPILOT", "AI-NOC INVESTIGATOR")
  .replace("Incident investigation", "Conversational investigation")
  .replace('"Review OEM checks"', '"OEM troubleshooting"')
  .replace('"Narrow likely causes"', '"Investigate network context"')
  .replace('"Compare resolved cases"', '"Correlate when needed"')
  .replace('"Verify or escalate"', '"Resolve and verify"')
  .replace(
    "Give me an alarm identifier, ticket, device, or symptom. I will establish the\n                evidence, ask what you have already checked, and guide the investigation one\n                decision at a time.",
    "Give me an alarm identifier, ticket, device, network/system identifier, or symptom. I will ask systems before humans, remember what has already been ruled out, and guide the investigation one decision at a time.",
  );
writeFileSync(chatPath, chat);

let pkg = readFileSync("package.json", "utf8");
pkg = pkg.replace(/"version": "[^"]+"/, '"version": "1.13.0"');
pkg = pkg.replace(
  /"scripts": \{[\s\S]*?\n  \},\n  "dependencies"/,
  '"scripts": {\n    "build": "node prepare-source.mjs && node fix-source.mjs && node apply-v113.mjs && next build && node scripts/provider-smoke.mjs",\n    "dev": "node prepare-source.mjs && node fix-source.mjs && node apply-v113.mjs && next dev",\n    "validate:v113": "node prepare-source.mjs && node fix-source.mjs && node apply-v113.mjs && npx tsc --noEmit"\n  },\n  "dependencies"',
);
if (!pkg.includes('"ai": "7.0.90"')) {
  pkg = pkg.replace(
    '"@ai-sdk/deepseek": "^3.0.36",',
    '"@ai-sdk/deepseek": "^3.0.36",\n    "ai": "7.0.90",',
  );
}
if (!pkg.includes('"@supabase/ssr": "0.12.5"')) {
  pkg = pkg.replace(
    '"@ai-sdk/deepseek": "^3.0.36",',
    '"@ai-sdk/deepseek": "^3.0.36",\n    "@supabase/ssr": "0.12.5",\n    "@supabase/supabase-js": "2.115.0",',
  );
}
JSON.parse(pkg);
writeFileSync("package.json", pkg);

execFileSync("node", ["scripts/validate-v113-source.mjs"], { stdio: "inherit" });
console.log(`V113_PATCH_OK release=${release} route=/ mode=read_only`);
