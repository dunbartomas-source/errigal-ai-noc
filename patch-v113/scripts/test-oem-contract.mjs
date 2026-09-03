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
  writeFileSync(
    join(tempDir, "copilot_cases.js"),
    '"use strict"; Object.defineProperty(exports, "__esModule", { value: true }); exports.COPILOT_CASES = { "A-DEMO": { tenant_id: "customer-a", incident: { ticket_id: "A-DEMO", alarm_identifier: "PWR-FAIL", summary: "Synthetic power failure", oem: "Corning" }, related_events: [{ alarm_identifier: "PWR-FAIL", offset_seconds: 0 }], deterministic_assessment: { correlation_required: false }, correlation: { sequence: [], dependencies: [] }, resolution_evidence: { local_history: [], global_patterns: { sample_count: 0 }, oem_guidance: { oem: "Corning", guidance: "Verify input voltage and power connections." } }, recommended_plan: [{ action: "Check the input voltage." }, { action: "Check the power connections." }], warnings: [] } };\n',
    "utf8",
  );
  compile("agent/lib/oem_playbook_source.ts", "oem_playbook_source.js");
  compile("agent/lib/copilot_source.ts", "copilot_source.js");

  const {
    buildOemAlarmPlaybookFromRows,
    getOemAlarmPlaybook,
    normalizeAlarmIdentifier,
  } = require(join(tempDir, "oem_playbook_source.js"));

  // Exact matching is case-insensitive but preserves meaningful separators.
  assert.equal(normalizeAlarmIdentifier("  alm_100  "), "ALM_100");
  assert.equal(normalizeAlarmIdentifier("Temperature High"), "TEMPERATURE HIGH");
  assert.equal(normalizeAlarmIdentifier("temperature__High"), "TEMPERATURE__HIGH");
  assert.notEqual(
    normalizeAlarmIdentifier("Temperature High"),
    normalizeAlarmIdentifier("temperature__High"),
  );

  const baseRow = {
    alarm_identifier: "ALM_100",
    comment: "IONM",
    context: "Input Power High Alarm",
    trap_name: "alarmTrap",
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
  assert.equal(deduped.canonical_alarm_identifier, "ALM_100");
  assert.equal(deduped.source_row_count, 2);
  assert.equal(deduped.logical_playbook_count, 1);
  assert.equal(deduped.deduplicated_row_count, 1);
  assert.equal(deduped.matching_policy.software_version_used, false);
  assert.equal(
    deduped.matching_policy.identifier_normalization,
    "trim_nfkc_casefold_preserve_separators",
  );
  assert.equal(deduped.matching_policy.oem_derived_from_alarm_identifier, false);
  assert.equal(deduped.matching_policy.mixed_comment_field_used, false);
  assert.equal(deduped.oem, null);
  assert.equal(deduped.context, "Input Power High Alarm");
  assert.equal(deduped.trap_name, "alarmTrap");
  assert.equal(deduped.description, baseRow.description);
  assert.equal(deduped.remedy, baseRow.remedy);
  assert.equal(deduped.technical_info, baseRow.technical_info);
  assert.equal(deduped.checklist.length, 2);
  assert.ok(deduped.checklist.every((step) => step.source_field === "remedy"));
  assert.ok(!JSON.stringify(deduped).includes("IONM"));

  // A misleading comment value that looks like an OEM must never become OEM.
  const mixedCommentIgnored = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "COMMENT-1",
    "COMMENT-1",
    [
      {
        alarm_identifier: "COMMENT-1",
        comment: "Corning",
        context: "Controlled context",
        trap_name: "alarmTrap",
        description: "Controlled description",
        remedy: "Check the controlled source.",
      },
    ],
  );
  assert.equal(mixedCommentIgnored.status, "success");
  assert.equal(mixedCommentIgnored.oem, null);
  assert.ok(!JSON.stringify(mixedCommentIgnored).includes("Corning"));

  // A future dedicated OEM field remains supported.
  const explicitOem = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "OEM-1",
    "OEM-1",
    [
      {
        alarm_identifier: "OEM-1",
        oem: "Corning",
        comment: "Do not use this",
        context: "Controlled context",
        trap_name: "alarmTrap",
        description: "Controlled description",
        remedy: "Check the controlled source.",
      },
    ],
  );
  assert.equal(explicitOem.oem, "Corning");
  assert.ok(!JSON.stringify(explicitOem).includes("Do not use this"));

  // Real Trap Knowledge contains duplicate/version rows whose trap_name differs
  // while controlled troubleshooting guidance is equivalent. Metadata variance
  // must not create a false data conflict.
  const trapMetadataVariant = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "ALM_100",
    "ALM_100",
    [baseRow, { ...duplicateVersionRow, trap_name: "majorAlarmTrap" }],
  );
  assert.equal(trapMetadataVariant.status, "success");
  assert.deepEqual(
    trapMetadataVariant.trap_names.sort(),
    ["alarmTrap", "majorAlarmTrap"].sort(),
  );
  assert.equal(trapMetadataVariant.data_conflicts.length, 0);

  const remedyConflict = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "ALM_100",
    "ALM_100",
    [baseRow, { ...duplicateVersionRow, remedy: "Replace the module immediately." }],
  );
  assert.equal(remedyConflict.status, "data_conflict");
  assert.ok(remedyConflict.data_conflicts.some((item) => item.field === "remedy"));
  assert.equal(remedyConflict.logical_playbook_count, 0);

  const oemConflict = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "OEM-CONFLICT",
    "OEM-CONFLICT",
    [
      { ...baseRow, alarm_identifier: "OEM-CONFLICT", oem: "Corning" },
      { ...duplicateVersionRow, alarm_identifier: "OEM-CONFLICT", oem: "CommScope" },
    ],
  );
  assert.equal(oemConflict.status, "data_conflict");
  assert.ok(oemConflict.data_conflicts.some((item) => item.field === "oem"));

  const noCrossAlarmLeak = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "ALM_100",
    "ALM_100",
    [
      baseRow,
      {
        alarm_identifier: "OTHER-999",
        comment: "JMA",
        context: "Other context",
        trap_name: "Other Alarm",
        description: "This must never leak into ALM_100.",
        remedy: "Do not leak this remedy.",
        technical_info: "Do not leak this technical information.",
      },
    ],
  );
  assert.equal(noCrossAlarmLeak.status, "success");
  assert.equal(noCrossAlarmLeak.source_row_count, 1);
  assert.ok(!JSON.stringify(noCrossAlarmLeak).includes("Do not leak"));
  assert.ok(!JSON.stringify(noCrossAlarmLeak).includes("JMA"));

  const separatorIsolation = buildOemAlarmPlaybookFromRows(
    "keystats_table",
    "temperature__High",
    "temperature__High",
    [
      {
        alarm_identifier: "Temperature High",
        trap_name: "spvAlarmNotification",
        description: "The module operating temperature is too high.",
        remedy: "Improve the cooling of the system.",
      },
      {
        alarm_identifier: "temperature__High",
        trap_name: "majorAlarmTrap",
        description: "",
        remedy: "",
      },
    ],
  );
  assert.equal(separatorIsolation.status, "success");
  assert.equal(separatorIsolation.source_row_count, 1);
  assert.ok(!JSON.stringify(separatorIsolation).includes("Improve the cooling"));

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
        context: "Technical Procedure Test",
        trap_name: "alarmTrap",
        description: "A controlled test row.",
        remedy: "Check the alarm state.",
        technical_info:
          "1. Capture the current reading.\n2. Compare it with the approved threshold.",
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

  // Preview has one reserved, clearly labelled synthetic incident so the MVP
  // remains testable even when a supplied live identifier is absent.
  process.env.AI_NOC_DATA_SOURCE = "keystats";
  process.env.VERCEL_ENV = "preview";
  const demoPlaybook = await getOemAlarmPlaybook("demo-pwr-fail");
  assert.equal(demoPlaybook.status, "success");
  assert.equal(demoPlaybook.source, "synthetic_demo");
  assert.equal(demoPlaybook.canonical_alarm_identifier, "DEMO-PWR-FAIL");
  assert.equal(demoPlaybook.checklist.length, 2);
  assert.ok(demoPlaybook.warnings.some((warning) => warning.includes("Synthetic")));

  const { getCopilotIncidentCase } = require(join(tempDir, "copilot_source.js"));
  const demoContext = await getCopilotIncidentCase(
    "customer-a",
    "DEMO-NETWORK",
    "DEMO-PWR-FAIL",
  );
  assert.equal(demoContext.status, "success");
  assert.equal(demoContext.source, "synthetic");
  assert.equal(demoContext.case_data.incident.alarm_identifier, "DEMO-PWR-FAIL");
  assert.equal(demoContext.case_data.incident.demo, true);

  console.log(
    "V113_OEM_CONTRACT_OK cases=12 separator_preserving_exact_match=pass mixed_comment=ignored explicit_oem_only=pass duplicate_versions=dedup metadata_variants=retained conflict=fail_closed cross_alarm=blocked software_version_filter=off preview_demo=isolated",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
