---
description: Use after incident evidence identifies PWR-FAIL, low input voltage, PSU, upstream feed, power-connection, or power-cascade symptoms and the user needs troubleshooting or resolution guidance.
---

# Power Fault Troubleshooting

This skill is an approved troubleshooting procedure, not a source of incident facts. Use only the evidence returned by AI-NOC tools for the current tenant and ticket. Never invent live readings, actions already taken, or another customer's details.

## Procedure

1. **Confirm current operational state first.** Tell the engineer to validate the live alarm, service impact and current power state in NOVA/OEM monitoring before acting on stored evidence.
2. **Establish scope and sequence.** Check whether PWR-FAIL is isolated or followed by downstream symptoms such as COMM-LOSS or UNIT-OFFLINE. Treat temporal correlation as evidence, not proof.
3. **Validate the upstream power path before condemning hardware.** Where safe and authorized, verify the relevant AC/DC feed, breaker/fuse state, input voltage, power leads, terminals and connectors. A low-input-voltage or feed/connection pattern should be investigated before PSU replacement.
4. **Assess PSU hardware only after input/feed validation.** Use PSU LEDs/telemetry/diagnostics and the evidence pack's local history, anonymized Errigal-wide resolution patterns and OEM guidance. Do not recommend replacement merely because PWR-FAIL exists.
5. **Use historical outcomes as weighted evidence.** Prefer exact OEM/model/software/alarm matches. Explain when local history, anonymized global outcomes and OEM guidance agree or conflict.
6. **Check downstream recovery.** If the power hypothesis is correct, related COMM-LOSS/UNIT-OFFLINE symptoms should recover after stable power is restored. If they do not, treat them as potentially separate faults.
7. **Escalate deliberately.** Recommend a field engineer when physical feed, cabling, terminals or PSU inspection/replacement is required. Recommend OEM escalation when verified healthy input still produces the power alarm, diagnostics conflict, or the approved local checks do not isolate the cause.
8. **Close only with evidence.** Require the primary power alarm to be clear in live monitoring, service restored, related downstream alarms recovered or separately explained, root cause/action captured in the ticket workflow, and recurrence monitoring defined.

## Guardrails

- Recommendations only; never claim to switch power, reset equipment, replace hardware, dispatch a field engineer, contact an OEM or close a ticket.
- If confidence is low or evidence conflicts, explicitly request the missing live measurements rather than forcing a root cause.
- The evidence pack wins over this generic procedure whenever they differ.
