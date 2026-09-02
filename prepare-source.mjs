import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const base = "https://raw.githubusercontent.com/dunbartomas-source/errigal-ai-noc/main";

async function fetchText(path) {
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) throw new Error(`GitHub ${response.status} fetching ${path}`);
  return await response.text();
}

async function applyVerifiedTextPatch(prefix, paths, expectedHash) {
  const contents = [];
  for (const path of paths) {
    const content = await fetchText(`${prefix}/${path}`);
    contents.push({ path, content });
  }
  const hash = createHash("sha256");
  for (const { path, content } of contents) {
    hash.update(path);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  const actual = hash.digest("hex");
  if (actual !== expectedHash) throw new Error(`PATCH_CHECKSUM_FAILED prefix=${prefix} expected=${expectedHash} actual=${actual}`);
  for (const { path, content } of contents) {
    const slash = path.lastIndexOf("/");
    if (slash > 0) mkdirSync(path.slice(0, slash), { recursive: true });
    writeFileSync(path, content);
  }
  return actual;
}

// Start from the verified v1.4 source archive.
const parts = Array.from({ length: 9 }, (_, i) => `source-v14.part.${String(i).padStart(2, "0")}`);
const chunks = [];
for (const part of parts) chunks.push((await fetchText(part)).trim());
const archive = Buffer.from(chunks.join(""), "base64");
const expectedBase = "d7e2258ac64365cc77f4437f49b15afda127129f1e1a6bd1a46a6d0588fe0938";
const actualBase = createHash("sha256").update(archive).digest("hex");
if (actualBase !== expectedBase) throw new Error(`SOURCE_CHECKSUM_FAILED expected=${expectedBase} actual=${actualBase}`);
writeFileSync("source-v14.tgz", archive);
execFileSync("tar", ["-xzf", "source-v14.tgz"], { stdio: "inherit" });

// Preserve the v1.5 compact specialist behavior for the individual drill-down experiences.
const v15Patch = await applyVerifiedTextPatch(
  "patch-v15",
  [
    "agent/instructions.md",
    "agent/subagents/incident-investigation/instructions.md",
    "agent/subagents/correlation-root-cause/instructions.md",
    "agent/subagents/troubleshooting-resolution/instructions.md"
  ],
  "87a717ffb2967526710bd8e77eb23940bdeb02e4ce9075e4478419862b61413d"
);

// v1.6 replaces only the default Copilot path: one combined deterministic pack + one model synthesis.
const v16Patch = await applyVerifiedTextPatch(
  "patch-v16",
  [
    "agent/agent.ts",
    "agent/instructions.md",
    "agent/tools/get_copilot_incident_evidence_pack.ts"
  ],
  "36a8528dde44f7b61c7f4c7680e9770463d3f90854457701a3c59362d84db950"
);

// v1.7 adds the repeatable Eve regression suite for Copilot architecture, privacy, safety and missing-evidence behavior.
const v17Patch = await applyVerifiedTextPatch(
  "patch-v17",
  [
    "evals/evals.config.ts",
    "evals/copilot/happy-path.eval.ts",
    "evals/copilot/privacy-boundary.eval.ts",
    "evals/copilot/safety-boundary.eval.ts",
    "evals/copilot/not-found.eval.ts",
    "evals/README.md"
  ],
  "3e58f29eaf86ae1efc829d6cceb7d3260d62b1f54bc93bcf825a455478c6ffba"
);

// v1.8 expands Copilot to six deliberately different synthetic incident behaviours and fans the regression suite across them.
const v18Patch = await applyVerifiedTextPatch(
  "patch-v18",
  [
    "agent/lib/copilot_cases.ts",
    "agent/tools/get_copilot_incident_evidence_pack.ts",
    "evals/copilot/incident-matrix.eval.ts",
    "evals/README.md"
  ],
  "0d6e1080792c7588a8d0bd7202ed3fd6484d12ac2f99d4aeed45d7a57684d7ed"
);

const pagePath = "app/page.tsx";
let page = readFileSync(pagePath, "utf8");
const copilotPrompt = '    const prompt = `Run the end-to-end AI-NOC Copilot workflow for tenant ${tenant.trim()} and ticket ${ticket.trim()}. Call get_copilot_incident_evidence_pack exactly once and synthesize the final answer directly from that pack. Do not delegate to any subagent and do not independently re-query after the pack succeeds. Use Incident Summary, Correlation & Likely Root Cause, Evidence That Matters, Recommended Troubleshooting & Resolution, Escalation / Closure Criteria, and Confidence, Freshness & Gaps. Keep it concise, distinguish local evidence from anonymized Errigal-wide evidence and OEM guidance, treat correlation/root-cause rankings as hypotheses rather than proof, and execute nothing.`;';
const beforePrompt = page;
page = page.replace(/    const prompt = `Run an end-to-end AI-NOC Copilot incident workflow[\s\S]*?`;/, copilotPrompt);
if (page === beforePrompt) throw new Error("COPILOT_PROMPT_PATCH_FAILED");
page = page
  .replace("Start with one ticket. The orchestrator automatically moves through investigation, common-cause correlation when warranted, and evidence-led troubleshooting without making the engineer select each specialist.", "Start with one ticket. Copilot combines incident, correlation, historical resolution and OEM evidence deterministically, then uses one model synthesis to produce the joined-up NOC answer.")
  .replace("Running specialist chain…", "Building Copilot assessment…")
  .replace("The orchestrator will run Incident Investigation first, automatically test correlated symptoms with Root Cause, then build the Troubleshooting & Resolution plan.", "Copilot will assemble one privacy-safe evidence pack covering the incident, correlated symptoms, likely root cause and ordered resolution plan, then synthesize it once.")
  .replace("Running joined-up AI-NOC workflow", "Building single-pass Copilot assessment")
  .replace("A-2000: automatic Investigation → Correlation/Root Cause → Troubleshooting/Resolution using three specialist evidence packs.", "A-2000: one deduplicated Copilot evidence pack combines investigation, correlation/root-cause evidence and troubleshooting guidance before a single DeepSeek synthesis.")
  .replace("<strong>Automatic specialist chain</strong><p>Incident Investigation → Correlation & Root Cause when correlated symptoms exist → Troubleshooting & Resolution → one synthesized NOC answer</p>", "<strong>Single-pass Copilot</strong><p>One deterministic evidence pack → one DeepSeek synthesis. Specialist agents remain available separately for drill-down and testing.</p>");
writeFileSync(pagePath, page);

const healthPath = "app/api/health/route.ts";
let health = readFileSync(healthPath, "utf8");
health = health.replace(/version: "[^"]+"/, 'version: "1.8.0"');
if (!health.includes("copilot_architecture")) {
  health = health.replace('    model: "deepseek/deepseek-v3.2",', '    model: "deepseek/deepseek-v3.2",\n    copilot_architecture: "single_model_combined_evidence_pack",');
}
health = health.replace(/eval_suite: "[^"]+"/, 'eval_suite: "eve_copilot_regression_v2_incident_matrix"');
if (!health.includes("synthetic_incident_cases")) {
  health = health.replace('    eval_suite: "eve_copilot_regression_v2_incident_matrix",', '    eval_suite: "eve_copilot_regression_v2_incident_matrix",\n    synthetic_incident_cases: 6,');
}
health = health.replace('evidence_packs: ["get_incident_evidence_pack"', 'evidence_packs: ["get_copilot_incident_evidence_pack", "get_incident_evidence_pack"');
writeFileSync(healthPath, health);

let pkg = readFileSync("package.json", "utf8");
pkg = pkg.replace(/"version": "[^"]+"/, '"version": "1.8.0"');
writeFileSync("package.json", pkg);

console.log(`SOURCE_OK base_sha256=${actualBase} v15_patch_sha256=${v15Patch} v16_patch_sha256=${v16Patch} v17_patch_sha256=${v17Patch} v18_patch_sha256=${v18Patch} release=v1.8.0`);
