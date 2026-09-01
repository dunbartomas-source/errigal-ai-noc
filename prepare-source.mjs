import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const base = "https://raw.githubusercontent.com/dunbartomas-source/errigal-ai-noc/main";

async function fetchText(path) {
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) throw new Error(`GitHub ${response.status} fetching ${path}`);
  return await response.text();
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

// Apply the v1.5 compact-Copilot handoff patch from normal source files.
const patchFiles = [
  "agent/instructions.md",
  "agent/subagents/incident-investigation/instructions.md",
  "agent/subagents/correlation-root-cause/instructions.md",
  "agent/subagents/troubleshooting-resolution/instructions.md"
];
const patchContents = [];
for (const path of patchFiles) {
  const content = await fetchText(`patch-v15/${path}`);
  patchContents.push({ path, content });
}
const patchHash = createHash("sha256");
for (const { path, content } of patchContents) {
  patchHash.update(path);
  patchHash.update("\0");
  patchHash.update(content);
  patchHash.update("\0");
}
const expectedPatch = "87a717ffb2967526710bd8e77eb23940bdeb02e4ce9075e4478419862b61413d";
const actualPatch = patchHash.digest("hex");
if (actualPatch !== expectedPatch) throw new Error(`PATCH_CHECKSUM_FAILED expected=${expectedPatch} actual=${actualPatch}`);
for (const { path, content } of patchContents) writeFileSync(path, content);

// Make the Copilot UI explicitly request compact handoffs from each specialist.
const pagePath = "app/page.tsx";
let page = readFileSync(pagePath, "utf8");
const copilotPrompt = '    const prompt = `Run an end-to-end AI-NOC Copilot incident workflow for tenant ${tenant.trim()} and ticket ${ticket.trim()}. This is an explicit combined workflow. Use the compact Copilot handoff protocol: every specialist request must begin with COPILOT_HANDOFF_MODE and must ask for the compact handoff only, never the specialist\'s full user-facing report. First delegate exactly once to Incident Investigation. If its compact handoff says correlation_required: true, delegate exactly once to Correlation & Root Cause using the incident_group_id from that handoff. Then delegate exactly once to Troubleshooting & Resolution using the same ticket; pass only the leading root-cause hypothesis/confidence from correlation when available, not the full prior handoff. Synthesize one concise NOC response under about 700 words with Incident Summary, Correlation & Likely Root Cause, Evidence That Matters, Recommended Troubleshooting & Resolution, Escalation / Closure Criteria, and Confidence, Freshness & Gaps. Clearly distinguish local evidence, anonymized Errigal-wide evidence and OEM guidance without repeating the same evidence across sections. Do not independently re-investigate, do not call Network Intelligence, NOC Operations or Knowledge & Learning, and do not repeat any specialist call. Recommendations only; execute nothing.`;';
const beforePage = page;
page = page.replace(/    const prompt = `Run an end-to-end AI-NOC Copilot incident workflow[\s\S]*?`;/, copilotPrompt);
if (page === beforePage) throw new Error("COPILOT_PROMPT_PATCH_FAILED");
writeFileSync(pagePath, page);

// Keep runtime/source version metadata aligned with the optimized release.
const healthPath = "app/api/health/route.ts";
let health = readFileSync(healthPath, "utf8");
health = health.replace(/version: "[^"]+"/, 'version: "1.5.0"');
writeFileSync(healthPath, health);
let pkg = readFileSync("package.json", "utf8");
pkg = pkg.replace(/"version": "[^"]+"/, '"version": "1.5.0"');
writeFileSync("package.json", pkg);

console.log(`SOURCE_OK base_sha256=${actualBase} patch_sha256=${actualPatch} release=v1.5.0`);
