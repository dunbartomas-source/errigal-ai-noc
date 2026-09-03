import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const tempDir = mkdtempSync(join(tmpdir(), "ai-noc-resolution-privacy-"));
const require = createRequire(import.meta.url);

function compile(sourcePath, targetName) {
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: sourcePath,
  }).outputText;
  writeFileSync(join(tempDir, targetName), output, "utf8");
}

try {
  writeFileSync(
    join(tempDir, "copilot_source.js"),
    `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCopilotIncidentCase = async function () {
  return {
    status: "success",
    source: "keystats",
    read_only: true,
    is_live: false,
    warnings: [],
    case_data: {
      resolution_evidence: {
        local_history: [
          {
            resolution: "Replaced",
            root_cause: "Hardware Failure",
            notes: "Replaced failed remote power supply.",
            _source_ticket_id: "639880",
            _source_change_id: "976975"
          },
          {
            resolution: "Repaired",
            root_cause: "Hardware Failure",
            notes: "Engineer John Smith at customer Alpha site Dublin replaced PSU. Ticket 639881. IP 10.0.0.5. john.smith@example.com",
            _source_ticket_id: "639881",
            _source_change_id: "976976"
          },
          {
            resolution: "Reboot",
            root_cause: "Software",
            notes: "Rebooted EMS module and verified service restored.",
            _source_ticket_id: "639882",
            _source_change_id: "976977"
          }
        ],
        global_patterns: { sample_count: 3, patterns: [] }
      }
    }
  };
};
`,
    "utf8",
  );
  compile("agent/lib/resolution_history_source.ts", "resolution_history_source.js");

  const { searchResolutionHistory } = require(
    join(tempDir, "resolution_history_source.js"),
  );
  const result = await searchResolutionHistory({
    alarm_identifier: "ALM_100",
    already_tried_actions: ["Reboot"],
  });

  assert.equal(result.status, "success");
  assert.equal(result.privacy, "anonymized_no_ticket_ids_sanitized_notes");
  assert.equal(result.comparable_case_count, 3);
  assert.equal(result.anonymized_examples[0].sanitized_note, "Replaced failed remote power supply.");
  assert.equal(result.anonymized_examples[0].note_privacy_status, "included_sanitized");
  assert.equal(result.anonymized_examples[1].sanitized_note, null);
  assert.equal(result.anonymized_examples[1].note_privacy_status, "omitted_privacy_risk");
  assert.equal(result.anonymized_examples[2].already_tried_match, true);

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "639880",
    "639881",
    "639882",
    "976975",
    "976976",
    "976977",
    "John Smith",
    "Alpha",
    "Dublin",
    "10.0.0.5",
    "john.smith@example.com",
  ]) {
    assert.ok(!serialized.includes(forbidden), `privacy leak: ${forbidden}`);
  }
  assert.ok(!serialized.includes("ticket_id"));
  assert.ok(!serialized.includes("change_id"));

  const rebootPattern = result.patterns.find((item) => item.action === "Reboot");
  assert.ok(rebootPattern);
  assert.equal(rebootPattern.already_tried_match, true);

  console.log(
    "V113_RESOLUTION_PRIVACY_OK safe_notes=included risky_notes=omitted ticket_ids=blocked change_ids=blocked pii_patterns=blocked already_tried=deprioritized",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
