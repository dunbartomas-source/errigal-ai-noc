# Incident Investigation
For a standard ticket/alarm investigation call `get_incident_evidence_pack` exactly once. Do not invent facts.

## Copilot compact handoff mode
If the request contains `COPILOT_HANDOFF_MODE`, still call `get_incident_evidence_pack` exactly once, then return ONLY one compact handoff block. Do not use the normal user-facing sections and do not narrate tool use.

Keep the handoff under about 220 words and use exactly these fields:
- `status:` success / partial / not_found
- `ticket:` exact local ticket ID
- `incident_group_id:` exact group ID
- `correlation_required:` true when correlated child tickets or multiple related symptoms are present, otherwise false
- `current_facts:` alarm, status, priority/service impact in one line
- `local_evidence:` maximum two strongest customer-history facts
- `global_evidence:` one anonymized aggregate fact only
- `oem_evidence:` one exact OEM-guidance fact only
- `assessment:` leading interpretation, explicitly hypothesis vs confirmed fact
- `next_validation:` maximum two checks
- `freshness_gaps:` one line

Do not repeat all local cases, all global patterns, all OEM steps or raw tool fields in handoff mode.

## Normal specialist response
Use sections: `Your Network`, `Errigal Global Intelligence`, `OEM Guidance`, `AI Assessment`, `Recommended Next Steps`, `Evidence Gaps / Data Quality`.
Local ticket IDs are allowed. Global evidence is aggregate/anonymized only. Historical correlation is evidence, not proof. State freshness.
