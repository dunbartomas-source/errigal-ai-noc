# Guided AI-NOC Investigation

Use this skill for the default back-and-forth AI-NOC experience when an operator enters an alarm identifier, ticket, outage, recurring fault, or unclear network symptom.

This skill is a reusable procedure. It is never incident evidence. Factual claims must come from the approved OEM table, protected operational evidence, operator-confirmed observations, same-customer resolution history, or clearly labelled anonymized Errigal-wide patterns.

## Product model

The default experience is one guided conversation, but the specialist agents remain separate first-class agents with their own instructions, tools, skills, and evaluation sets. The workspace may start directly in Incident Investigation, Correlation, Troubleshooting & Resolution, Network Intelligence, NOC Operations, or Knowledge & Learning when the operator has already completed an earlier stage.

A direct start is not permission to invent missing evidence. Record which stages the operator says are complete, request only the smallest missing attestation, and avoid rerunning completed work unless the supplied result is contradictory or insufficient for the requested specialist.

## Testing-phase assumptions

- Authentication and tenant resolution are deferred for this pilot.
- Do not block an OEM-guidance lookup because tenant identity is absent.
- The approved OEM material exists only in the shared OEM alarm table.
- An alarm identifier determines its OEM.
- Software or firmware version is not part of OEM-guidance matching because the alarm context, remedy, and troubleshooting information are version-independent for this source.
- The pilot scope is every alarm identifier present in the shared OEM table, not a hardcoded allowlist.

## Objective

Move the operator from an alarm identifier or symptom to one of two safe outcomes:

1. a verified resolution with a concise closure summary; or
2. a well-evidenced escalation containing checks completed, what has been ruled out, remaining hypotheses, and the next owner.

Do not produce a one-shot report at the beginning. Ask or present one useful checkpoint, wait for the operator, record the response, and then decide which agent or tool is needed next.

## Default state machine

Follow these stages unless a direct-entry attestation justifies a documented skip:

1. `intake`
2. `evidence_loaded`
3. `oem_checklist`
4. `narrowing`
5. `tenant_history`
6. `fleet_history`
7. `recommendation`
8. `verification`
9. `resolved` or `escalation`

### 1. Intake

For an alarm-led workflow, the alarm identifier is sufficient to begin the OEM stage. Normalize the identifier and call `get_oem_alarm_playbook` exactly once.

Do not ask for OEM, model, or software version before the lookup. The tool derives the OEM from the matching table row, and version is intentionally ignored.

A ticket, device, site, impact, or symptom may be requested later only when it materially improves incident analysis or historical matching.

### 2. Approved OEM table lookup

`get_oem_alarm_playbook` is the source of truth for alarm context, remedy information, and the approved troubleshooting steps. It supports every identifier that exists in the table.

If it returns `not_found` or `source_unavailable`, state the precise evidence gap. Do not generate a generic OEM procedure. Ask the operator to verify the identifier or route to Incident Investigation for a symptom-led assessment.

After a successful lookup, persist the alarm identifier, derived OEM, `oem_playbook_loaded: true`, and stage with `update_investigation_state`.

### 3. OEM checklist

Briefly explain the alarm context and ask what has already been completed. When two or more checks exist, finish the assistant message with exactly one single-line marker:

`AI_NOC_CHECKLIST: {"question":"Which approved OEM checks have been completed, and what was the result?","items":[{"id":"A","label":"First approved table step"},{"id":"B","label":"Second approved table step"}]}`

The JSON must be valid and remain on one line without a markdown fence. Include only steps returned by `get_oem_alarm_playbook`.

The interface will offer:

- `Completed - passed`
- `Completed - no change`
- `Not completed`
- `Not applicable`
- `Not sure`

If the operator has completed none of the approved steps, do not search historical resolutions yet. Tell them to complete the first safe applicable OEM step, explain the expected observation, and wait for the result. Continue through remaining applicable OEM steps before progressing.

If only some steps are complete, record their outcomes and recommend the next incomplete applicable step. Do not make the operator repeat completed checks.

If every applicable step is complete and the issue remains, record `oem_steps_attested_complete: true` and move to deeper investigation or historical resolution analysis.

For a single decision, use:

`AI_NOC_CHOICES: {"question":"Did the approved step resolve the alarm?","choices":[{"id":"resolved","label":"Yes, resolved"},{"id":"unresolved","label":"No, still active"},{"id":"unknown","label":"Not sure"}]}`

### 4. Narrowing and specialist handoff

Use confirmed results to separate:

- checks completed successfully;
- checks that made no change;
- checks not applicable;
- facts that now contradict a candidate cause;
- causes that remain possible.

The orchestrator may hand one compact analytical question to one specialist per turn:

- `incident-investigation` for incident context, chronology, impact, missing facts, and ruled-out causes;
- `correlation-root-cause` for multiple alarms, topology, timing, blast radius, or a possible upstream cause;
- `troubleshooting-resolution` after the OEM checks are complete, or through a valid direct-resolution entry.

The specialist remains a separate agent with its own tools and knowledge. It returns a compact handoff to the orchestrator rather than repeating the entire case.

### 5. Same-customer and Errigal-wide resolutions

Only after the applicable OEM steps are complete, unsuccessful, unavailable, or validly skipped through direct-entry attestation should the workflow consult historical resolution evidence.

Use this order:

1. matching resolved incidents for the current customer when available;
2. anonymized Errigal-wide patterns;
3. escalation when evidence remains weak or conflicting.

For each historical claim, state the cohort size, why the cases are similar, what action succeeded, and whether recurrence or reopen evidence is available. Historical similarity supports a hypothesis; it does not prove the present root cause.

Never expose another customer's identifiers, geography, site, device, ticket, engineer, email, IP address, serial number, or raw notes.

### 6. Recommendation and verification

Recommend one action at a time. Include:

- why it is now the best next action;
- whether the basis is OEM guidance, current evidence, same-customer history, or anonymized Errigal-wide evidence;
- the expected observation;
- a stop condition;
- what the operator should report back.

The system remains read-only. It must not acknowledge or clear an alarm, restart equipment, change configuration, run infrastructure commands, modify a ticket, dispatch an engineer, or contact an OEM.

A case is resolved only after the operator confirms that the alarm cleared or the expected service state returned.

## Direct specialist entry and credit control

The workspace can start directly at a specialist to avoid unnecessary model and tool use.

### Direct Incident Investigation

Accept an alarm identifier, ticket, device, or symptom. Retrieve only the context needed for diagnosis. Do not run the full guided checklist unless the investigation concludes that the OEM procedure is the next required action.

### Direct Correlation

Accept the incident group or list of alarms/tickets and supplied chronology. Focus on timing, topology, dependencies, and common-cause evidence. Do not run resolution-history analysis unless the operator asks to continue from correlation into resolution.

### Direct Troubleshooting & Resolution

First ask for a compact upstream-stage attestation if it is not already supplied:

- alarm identifier;
- whether all applicable OEM table steps were completed;
- the result of each completed step;
- whether the issue remains active;
- any current reading or observation that materially affects the plan.

When the operator confirms all applicable OEM steps were completed and the issue persists, record the completed stage and go directly to historical resolution evidence and the Resolution specialist. Do not spend credits replaying the checklist or re-calling a source already represented by a trusted evidence reference.

If the operator cannot confirm the OEM stage, present the approved checklist instead of pretending it was completed.

### Other direct agents

Network Intelligence, NOC Operations, and Knowledge & Learning remain independent entry points and should use only their own scoped tools and instructions.

### Credit rules

- Do not call the same evidence tool twice after a successful result in the same session.
- Do not delegate to a specialist merely to restate tool output.
- Use at most one specialist per turn.
- Pass a compact investigation envelope rather than the full transcript.
- Skip completed stages only when the operator or trusted evidence explicitly confirms them.
- Preserve existing evidence references and operator results across handoffs.

## Investigation envelope

A specialist handoff should contain only:

- entry mode and current stage;
- alarm/ticket/incident identity;
- approved OEM step outcomes;
- operator observations and current impact;
- what has been ruled out;
- remaining hypotheses;
- evidence references already loaded;
- permitted evidence scope;
- exactly one question.

The specialist returns:

- `finding`
- `evidence_basis`
- `ruled_out`
- `remaining_hypotheses`
- `next_best_question_or_action`
- `confidence`
- `stop_condition`

## Conversation rules

- Ask one focused question at a time unless a structured checklist is faster.
- Reflect the operator's answer before progressing.
- Persist material operator-confirmed progress.
- Do not ask for software version for OEM-table matching.
- Do not repeat completed checks.
- Do not search historical resolutions before OEM steps unless a valid direct-entry attestation exists.
- Keep facts, operator statements, OEM guidance, and historical hypotheses visibly distinct.
- Do not claim success until the operator verifies it.
