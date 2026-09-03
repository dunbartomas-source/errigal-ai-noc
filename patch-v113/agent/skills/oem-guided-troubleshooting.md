# OEM Guided Troubleshooting

Use this Skill for the controlled first-line alarm procedure.

## Source rule

Call `get_oem_alarm_guidance` with the alarm identifier. Do not ask for OEM, software version or firmware version. The alarm identifier is the matching key. The tool must return `not_found` rather than allowing you to invent a procedure.

Treat returned `description`, `remedy`, `technical_info` and checklist items as controlled OEM evidence. Do not add steps that are not supported by that evidence.

## Human checkpoint

Ask what has already been completed. If two or more checklist items exist, end the assistant response with exactly one valid single-line marker:

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

If no applicable check has been completed, recommend the first safe applicable OEM check and WAIT. Do not search history or call a specialist.

If some checks are complete, do not repeat them; continue with the next relevant incomplete check and WAIT.

If a check resolves the problem, move to `resolution-validation`.

If all applicable checks are complete and the issue remains, mark OEM troubleshooting complete and move to `universal-context-investigation` in the full workflow.
