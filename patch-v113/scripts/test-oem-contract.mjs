import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const tempDir = mkdtempSync(join(tmpdir(), "ai-noc-oem-contract-"));
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
  // The contract tests exercise the exported pure row builder. The production
  // module also imports synthetic demo fixtures for preview conversations; stub
  // that unrelated dependency so this no-model test does not pull in the demo stack.
  writeFileSync(
    join(tempDir, "copilot_cases.js"),
    '"use strict"; Object.defineProperty(exports, "__esModule", { value: true }); exports.COPILOT_CASES = {};\n',
    "utf8",
  );
  compile("agent/lib/oem_playbook_source.ts", "oem_playbook_source.js");

  const {
    buildOemAlarmPlaybookFromRows,
    normalizeAlarmIdentifier,
  } = require(join(tempDir, "oem_playbook_source.js"));

  assert.equal(normalizeAlarmIdentifier("  alm_100  "), "ALM-100");

  const baseRow = {
    alarm_identifier: "ALM_100",
    oem: "Corning",
    trap_name: "Input Power High",
    description: "Input power exceeded the configured alarm threshold.",
    remedy: "1. Check the input power level.\n2. Confirm attenuation is within the approved range.",
    technical_info: "Monitor the alarm state after the approved checks are completed.",
    software_version: "6.2.7",
  };

  const duplicateVersionRow = {
    ...baseRow,
    software_version: "6.3.1",
  };

  const deduped = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "alm_100",
    "ALM_100",
    [baseRow, duplicateVersionRow],
  );
  assert.equal(deduped.status, "success");
  assert.equal(deduped.canonical_alarm_identifier, "ALM-100");
  assert.equal(deduped.source_row_count, 2);
  assert.equal(deduped.logical_playbook_count, 1);
  assert.equal(deduped.deduplicated_row_count, 1);
  assert.equal(deduped.matching_policy.software_version_used, false);
  assert.equal(deduped.oem, "Corning");
  assert.equal(deduped.trap_name, "Input Power High");
  assert.equal(deduped.description, baseRow.description);
  assert.equal(deduped.remedy, baseRow.remedy);
  assert.equal(deduped.technical_info, baseRow.technical_info);
  assert.equal(deduped.checklist.length, 2);
  assert.ok(deduped.checklist.every((step) => step.source_field === "remedy"));

  const remedyConflict = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "ALM-100",
    "ALM-100",
    [
      baseRow,
      {
        ...duplicateVersionRow,
        remedy: "Replace the module immediately.",
      },
    ],
  );
  assert.equal(remedyConflict.status, "data_conflict");
  assert.ok(remedyConflict.data_conflicts.some((item) => item.field === "remedy"));
  assert.equal(remedyConflict.logical_playbook_count, 0);

  const oemConflict = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "ALM-100",
    "ALM-100",
    [baseRow, { ...duplicateVersionRow, oem: "CommScope" }],
  );
  assert.equal(oemConflict.status, "data_conflict");
  assert.ok(oemConflict.data_conflicts.some((item) => item.field === "oem"));

  const noCrossAlarmLeak = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "ALM-100",
    "ALM-100",
    [
      baseRow,
      {
        alarm_identifier: "OTHER-999",
        oem: "JMA",
        trap_name: "Other Alarm",
        description: "This must never leak into ALM-100.",
        remedy: "Do not leak this remedy.",
        technical_info: "Do not leak this technical information.",
      },
    ],
  );
  assert.equal(noCrossAlarmLeak.status, "success");
  assert.equal(noCrossAlarmLeak.source_row_count, 1);
  assert.equal(noCrossAlarmLeak.oem, "Corning");
  assert.ok(!JSON.stringify(noCrossAlarmLeak).includes("Do not leak"));

  const notFound = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "UNKNOWN-404",
    "UNKNOWN-404",
    [],
  );
  assert.equal(notFound.status, "not_found");
  assert.equal(notFound.source_row_count, 0);
  assert.equal(notFound.checklist.length, 0);

  const explicitTechnicalProcedure = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "TECH-1",
    "TECH-1",
    [
      {
        alarm_identifier: "TECH-1",
        oem: "Nextivity",
        trap_name: "Technical Procedure Test",
        description: "A controlled test row.",
        remedy: "Check the alarm state.",
        technical_info: "1. Capture the current reading.\n2. Compare it with the approved threshold.",
      },
    ],
  );
  assert.equal(explicitTechnicalProcedure.status, "success");
  assert.equal(explicitTechnicalProcedure.checklist.length, 3);
  assert.equal(explicitTechnicalProcedure.checklist[0].source_field, "remedy");
  assert.ok(
    explicitTechnicalProcedure.checklist
      .slice(1)
      .every((step) => step.source_field === "technical_info"),
  );

  console.log(
    "V113_OEM_CONTRACT_OK cases=6 exact_normalization=pass duplicate_versions=dedup conflict=fail_closed cross_alarm=blocked software_version_filter=off",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
