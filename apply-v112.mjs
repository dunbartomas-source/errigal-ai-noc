import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const repository = "dunbartomas-source/errigal-ai-noc";
const patchPrefix = "patch-v112-conversational";
const patchPaths = [
  "agent/lib/investigation_state.ts",
  "agent/tools/update_investigation_state.ts",
  "agent/skills/guided-investigation.md",
  "app/investigate/page.tsx",
  "app/investigate/investigation-chat.tsx",
  "app/investigate/investigation-chat.module.css",
  "scripts/validate-conversational-source.mjs",
  "fragments/orchestrator.md",
  "fragments/incident-investigation.md",
  "fragments/correlation-root-cause.md",
  "fragments/troubleshooting-resolution.md",
];

function currentCommit() {
  for (const candidate of [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
  ]) {
    if (candidate && /^[0-9a-f]{40}$/i.test(candidate)) return candidate;
  }

  const localCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(localCommit)) {
    throw new Error(`INVALID_BUILD_COMMIT ${localCommit}`);
  }
  return localCommit;
}

async function fetchText(base, path) {
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} fetching ${path}`);
  }
  return await response.text();
}

function writeText(path, content) {
  const slash = path.lastIndexOf("/");
  if (slash > 0) mkdirSync(path.slice(0, slash), { recursive: true });
  writeFileSync(path, content);
}

function appendOnce(target, fragment, marker) {
  const existing = readFileSync(target, "utf8");
  if (existing.includes(marker)) return;
  writeFileSync(target, `${existing.trimEnd()}\n\n${fragment.trim()}\n`);
}

const commit = currentCommit();
const base = `https://raw.githubusercontent.com/${repository}/${commit}/${patchPrefix}`;
const hash = createHash("sha256");

for (const path of patchPaths) {
  const content = await fetchText(base, path);
  hash.update(path);
  hash.update("\0");
  hash.update(content);
  hash.update("\0");
  writeText(path, content);
}

appendOnce(
  "agent/instructions.md",
  readFileSync("fragments/orchestrator.md", "utf8"),
  "Conversational guided investigation (v1.12)",
);
appendOnce(
  "agent/subagents/incident-investigation/instructions.md",
  readFileSync("fragments/incident-investigation.md", "utf8"),
  "Guided-investigation handoff contract (v1.12)",
);
appendOnce(
  "agent/subagents/correlation-root-cause/instructions.md",
  readFileSync("fragments/correlation-root-cause.md", "utf8"),
  "Guided-investigation handoff contract (v1.12)",
);
appendOnce(
  "agent/subagents/troubleshooting-resolution/instructions.md",
  readFileSync("fragments/troubleshooting-resolution.md", "utf8"),
  "Guided-investigation handoff contract (v1.12)",
);
rmSync("fragments", { recursive: true, force: true });

const pagePath = "app/page.tsx";
let page = readFileSync(pagePath, "utf8");
const launchPrompt =
  '    const prompt = `Start a guided AI-NOC investigation for tenant ${tenant.trim()} and ticket ${ticket.trim()}. Do not produce a one-shot final report. Load the guided-investigation skill, call get_copilot_incident_evidence_pack once, establish the alarm identifier and incident context, and ask the operator which approved OEM checks have already been completed. Ask one focused question at a time and wait for the reply. Persist material operator-confirmed progress with update_investigation_state. Delegate to at most one specialist per turn only when the guided-investigation routing rules require it. Use current-incident evidence and OEM guidance before same-tenant history, and use anonymized Errigal-wide patterns only after those steps are exhausted. Never execute remediation or modify a device, alarm, or ticket.`;';
page = page.replace(/    const prompt = `[\s\S]*?`;/, launchPrompt);
writeFileSync(pagePath, page);

const healthPath = "app/api/health/route.ts";
let health = readFileSync(healthPath, "utf8");
health = health
  .replace(/version: "[^"]+"/, 'version: "1.12.0"')
  .replace(
    /eval_suite: "[^"]+"/,
    'eval_suite: "eve_conversational_investigation_v1"',
  );
if (!health.includes("conversational_investigation:")) {
  health = health.replace(
    "    data_adapter:",
    '    conversational_investigation: { active: true, route: "/investigate", state: "eve_session", mode: "read_only" },\n    data_adapter:',
  );
}
writeFileSync(healthPath, health);

const packagePath = "package.json";
let pkg = readFileSync(packagePath, "utf8");
pkg = pkg.replace(/"version": "[^"]+"/, '"version": "1.12.0"');
JSON.parse(pkg);
writeFileSync(packagePath, pkg);

execFileSync("node", ["scripts/validate-conversational-source.mjs"], {
  stdio: "inherit",
});

console.log(
  `V112_PATCH_OK commit=${commit} sha256=${hash.digest("hex")} route=/investigate mode=read_only`,
);
