# OEM Guided Troubleshooting

Use this Skill for the controlled first-line alarm procedure.

## Source rule

Call `get_oem_alarm_guidance` with the alarm identifier. Do not ask for OEM, software version or firmware version before the lookup. The alarm identifier is the matching key. The tool must return `not_found` rather than allowing you to invent a procedure.

If the result is `not_found`, do not call universal context with that same unresolved identifier. Explain the gap in one short paragraph and offer only: retry the identifier, continue with a network/system identifier, or run the clearly labelled `DEMO-PWR-FAIL` walkthrough. Then wait.

Treat returned `context`, `description`, `remedy`, `technical_info` and checklist items as controlled Trap Knowledge evidence. `trap_name` is source metadata and may be generic. Do not add troubleshooting steps that are not supported by the controlled evidence.

The current Trap Knowledge export has a mixed-purpose `comment` field. It is not approved as an OEM field. If `oem` is null, say the OEM identity is not confirmed from the current structured source; do not infer it from `comment` or from the alarm wording.

## Human checkpoint

Ask what has already been completed. Whenever one or more checklist items exist, end the assistant response with exactly one valid single-line marker so live alarms use the same dropdown workflow as the demo:

`AI_NOC_CHECKLIST: {"question":"Which approved OEM checks have you already completed, and what happened?","items":[{"id":"A","label":"First controlled OEM step"},{"id":"B","label":"Second controlled OEM step"}]}`

Use only checklist items returned by the tool.

The UI maps operator answers to:

- `completed_resolved`
- `completed_unresolved`
- `not_completed`
- `not_applicable`
- `unable`

Persist material results with `update_investigation_state`.

## Gates

If no applicable check has been completed, recommend the first safe applicable OEM/Trap Knowledge check and WAIT. Do not search history or call a specialist.

If some checks are complete, do not repeat them; continue with the next relevant incomplete check and WAIT.

If a check resolves the problem, move to `resolution-validation`.

If all applicable checks are complete and the issue remains, mark OEM troubleshooting complete. In the full workflow, use a known ticket or network/system identifier for `universal-context-investigation`. If neither is known, end with exactly this marker and wait:

`AI_NOC_CHOICES: {"question":"Do you have a ticket or network/system identifier for the context investigation?","choices":[{"id":"network","label":"Enter network/system identifier"},{"id":"ticket","label":"Enter ticket ID"},{"id":"skip_resolution","label":"I don't have either - show past resolutions"}]}`

If the operator selects the no-identifier option, or has already explicitly said that neither identifier is available, persist `context_investigation` as `operator_override`, record the missing current-context evidence, and continue directly to `resolution-intelligence` once. Do not ask for the identifier again. Present historical resolutions as anonymized evidence and hypotheses, never as proof.
