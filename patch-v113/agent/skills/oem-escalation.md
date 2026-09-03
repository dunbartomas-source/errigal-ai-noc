# OEM Escalation

Use this Skill only when the investigation cannot safely progress with the approved troubleshooting/context evidence, when the controlled guidance explicitly requires escalation, or when the operator asks for an escalation draft.

This Skill prepares a **draft only**. Never contact an OEM, open/update a ticket, send an email, dispatch an engineer, clear an alarm, restart equipment, change configuration/software, or claim that an escalation was submitted.

## Before drafting

Read the canonical investigation state if needed. Reuse evidence already gathered; do not rerun expensive tools merely to make the draft look complete.

Include only confirmed current-incident facts and clearly labelled hypotheses. Historical resolution evidence may be summarized as an anonymized technical pattern, never as another customer's ticket/case identity.

If `oem` is not confirmed from a dedicated source or the operator, state `OEM/vendor not confirmed` and prepare an internal technical handover rather than pretending to address a named vendor. The current mixed Trap Knowledge `comment` field is not an approved OEM source.

## Draft structure

Produce a concise escalation package with:

1. **Incident identity** — alarm identifier, current network/system/device/site identifiers already available for this incident, and current status.
2. **Controlled Trap Knowledge evidence** — context/description/remedy/technical information used, plus any documentation conflict/gap.
3. **Checks completed** — each applicable check and operator-observed result. Do not list an unperformed action as completed.
4. **Operational timeline** — only the material recent alarms, changes, maintenance/topology observations and ordering relevant to the issue.
5. **Current assessment** — confirmed observations first; then possible relationships/hypotheses with uncertainty stated explicitly.
6. **Historical evidence** — aggregate/anonymized patterns only, if relevant. Historical similarity is not proof.
7. **Evidence gaps** — facts the approved systems could not retrieve and observations still missing.
8. **Specific escalation question** — what technical clarification, defect confirmation, log interpretation, RMA guidance, release-note/bug confirmation, or next approved diagnostic is being requested.
9. **Safety statement** — `Draft only — no OEM/customer contact or operational change has been performed by AI-NOC.`

## Quality gates

Do not:
- invent an OEM, software version, model, timestamp, completed check or root cause;
- convert temporal correlation into confirmed causation;
- expose another customer's ticket ID, site, device, IP/MAC, serial, engineer identity or raw note;
- recommend a write/action as though it has already happened;
- mark the incident resolved.

If the escalation package lacks a critical fact, retain it as an explicit evidence gap instead of asking for data an approved tool can retrieve. Ask the operator only for a genuinely human-only observation that blocks a useful escalation.

After presenting the draft, keep `issue_status` as active unless the operator explicitly decides the incident is being escalated; if they do, persist `issue_status: escalated` and `current_stage: escalation`. This status records the investigation handoff only and does not claim an external ticket/message was created.
