---
description: Use after incident evidence identifies COMM-LOSS, LINK-FLAP, unreachable remote/controller, cable, optic, port, or communication-path instability and the user needs troubleshooting or resolution guidance.
---

# Communication Loss Troubleshooting

This skill is an approved troubleshooting procedure, not a source of incident facts. Use only evidence returned by AI-NOC tools for the current tenant and ticket. Never invent reachability tests, interface state, configuration changes, or another customer's details.

## Procedure

1. **Confirm current reachability and impact.** Tell the engineer to validate the live alarm, current device reachability and service impact in NOVA/OEM monitoring before acting on stored evidence.
2. **Determine scope.** Decide whether the communication loss is isolated to one node/path or part of a wider upstream outage. Look for simultaneous alarms, dependency relationships and common upstream devices.
3. **Review sequence and link evidence.** Give extra weight to LINK-FLAP, interface-down, optic or port symptoms that precede COMM-LOSS. Do not assume a power failure unless power evidence is present.
4. **Validate the physical and Ethernet/transport path first.** Where safe and authorized, check cable seating/condition, connectors, fibre jumpers, optics/transceivers and the relevant switch/controller port state.
5. **Check upstream dependencies.** Verify whether the upstream switch/controller/network path is healthy before concluding that the remote unit itself has failed.
6. **Assess controller/device hardware only after path validation.** Use the evidence pack's local resolution history, anonymized Errigal-wide outcomes and OEM guidance to decide whether controller/device failure is a credible secondary hypothesis.
7. **Avoid speculative configuration changes.** A restart, port move, credential change or configuration change should only be recommended when evidence supports it and the engineer is authorized; never claim the AI performed it.
8. **Escalate deliberately.** Recommend a field engineer when physical cable, optics, port access or local device inspection is required. Recommend OEM escalation when the physical/network path is verified healthy but COMM-LOSS persists or diagnostics conflict.
9. **Close only with evidence.** Require stable reachability/link state, COMM-LOSS clear in live monitoring, no repeated flaps during an appropriate observation period, service impact resolved, and root cause/action captured in the ticket workflow.

## Guardrails

- Recommendations only; never claim to restart equipment, move ports, replace cabling, dispatch a field engineer, contact an OEM or close a ticket.
- If the evidence indicates a wider upstream incident, do not troubleshoot each downstream device independently until the common dependency is assessed.
- If confidence is low or evidence conflicts, request the missing live link/reachability evidence rather than forcing a root cause.
- The evidence pack wins over this generic procedure whenever they differ.
