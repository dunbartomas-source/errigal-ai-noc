import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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
  "agent/skills/incident-handover.md",
  "agent/subagents/correlation-root-cause/agent.ts",
  "agent/subagents/resolution-intelligence/agent.ts",
  "agent/subagents/resolution-intelligence/tools/search_resolution_history.ts",
  "app/page.tsx",
  "app/investigate/investigation-chat.tsx",
  "app/api/health/route.ts",
  "app/api/internal/oem-catalogue-check/route.ts",
  "app/api/internal/oem-catalogue-coverage/route.ts",
  "patch-v113/scripts/test-oem-contract.mjs",
];

for (const path of requiredFiles) {
  if (!existsSync(path)) throw new Error(`V113_SOURCE_MISSING ${path}`);
}

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
    const path = `${scope}/${tool}.ts`;
    if (!existsSync(path)) throw new Error(`V113_DISABLED_TOOL_MISSING ${path}`);
    if (!readFileSync(path, "utf8").includes("disableTool")) {
      throw new Error(`V113_DISABLED_TOOL_INVALID ${path}`);
    }
  }
}

const removedCapabilities = [
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
for (const removed of removedCapabilities) {
  if (existsSync(removed)) throw new Error(`V113_DEPRECATED_CAPABILITY_PRESENT ${removed}`);
}

const instructions = readFileSync("agent/instructions.md", "utf8");
for (const marker of [
  "Ask systems before humans",
  "correlation-root-cause",
  "resolution-intelligence",
  "Software version may matter later",
  "Maximum one specialist invocation per user turn",
  "State persistence is mandatory",
  "Do not park a turn",
]) {
  if (!instructions.includes(marker)) throw new Error(`V113_INSTRUCTION_MISSING ${marker}`);
}

const disabledAgent = readFileSync("agent/tools/agent.ts", "utf8");
if (!disabledAgent.includes("disableTool")) throw new Error("V113_GENERIC_AGENT_NOT_DISABLED");

for (const specialist of [
  "agent/subagents/correlation-root-cause/agent.ts",
  "agent/subagents/resolution-intelligence/agent.ts",
]) {
  if (!readFileSync(specialist, "utf8").includes("outputSchema")) {
    throw new Error(`V113_SPECIALIST_OUTPUT_SCHEMA_MISSING ${specialist}`);
  }
}

const oemSource = readFileSync("agent/lib/oem_playbook_source.ts", "utf8");
for (const marker of [
  '"data_conflict"',
  "software_version_used: false",
  'duplicate_version_rows: "deduplicate_equivalent_guidance"',
  'conflicting_guidance: "return_data_conflict"',
  "trap_name",
  "description",
  "remedy",
  "technical_info",
  "buildOemAlarmPlaybookFromRows",
]) {
  if (!oemSource.includes(marker)) throw new Error(`V113_OEM_CONTRACT_MISSING ${marker}`);
}

const oemTool = readFileSync("agent/tools/get_oem_alarm_guidance.ts", "utf8");
for (const marker of [
  "output.trap_name",
  "output.description",
  "output.remedy",
  "output.technical_info",
  "output.logical_playbook_count",
  "output.deduplicated_row_count",
  "output.data_conflicts",
]) {
  if (!oemTool.includes(marker)) throw new Error(`V113_OEM_TOOL_CONTRACT_MISSING ${marker}`);
}

for (const routePath of [
  "app/api/internal/oem-catalogue-check/route.ts",
  "app/api/internal/oem-catalogue-coverage/route.ts",
]) {
  const route = readFileSync(routePath, "utf8");
  for (const marker of [
    'process.env.VERCEL_ENV === "production"',
    "AI_NOC_DATA_SERVICE_TOKEN",
    "raw_rows_returned: false",
    "identifiers_returned: false",
  ]) {
    if (!route.includes(marker)) {
      throw new Error(`V113_OEM_PREVIEW_ROUTE_SAFETY_MISSING ${routePath} ${marker}`);
    }
  }
}

const coverageRoute = readFileSync("app/api/internal/oem-catalogue-coverage/route.ts", "utf8");
for (const marker of [
  "model_calls: 0",
  "software_version_filter_used: false",
  'conflict_policy: "fail_closed"',
  'duplicate_version_policy: "deduplicate_equivalent_guidance"',
  "unknown_identifier_not_found",
  "cross_alarm_violations",
]) {
  if (!coverageRoute.includes(marker)) {
    throw new Error(`V113_OEM_COVERAGE_CONTRACT_MISSING ${marker}`);
  }
}

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

const health = readFileSync("app/api/health/route.ts", "utf8");
for (const marker of [
  'version: "1.13.0"',
  '"correlation-root-cause"',
  '"resolution-intelligence"',
  "generic_agent_delegation: false",
]) {
  if (!health.includes(marker)) throw new Error(`V113_HEALTH_CONTRACT_MISSING ${marker}`);
}
for (const stale of ["incident-investigation", "troubleshooting-resolution", "knowledge-learning"]) {
  if (health.includes(stale)) throw new Error(`V113_HEALTH_STALE_CAPABILITY ${stale}`);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.version !== "1.13.0") throw new Error(`V113_PACKAGE_VERSION ${pkg.version}`);

execFileSync(process.execPath, ["patch-v113/scripts/test-oem-contract.mjs"], {
  stdio: "inherit",
});

console.log("V113_SOURCE_OK architecture=one-main-agent+4-skills+2-one-shot-specialists root_business_tools=4 disabled_defaults=7 oem_contract=exact+dedupe+conflict live_catalogue_harness=preview_only+aggregate mode=read_only");
