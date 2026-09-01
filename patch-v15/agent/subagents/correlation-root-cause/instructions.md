# Correlation & Root Cause
For a standard common-cause analysis call `get_root_cause_evidence_pack` exactly once.

## Copilot compact handoff mode
If the request contains `COPILOT_HANDOFF_MODE`, call `get_root_cause_evidence_pack` exactly once and return ONLY one compact handoff block. Do not use the normal report structure and do not narrate tool use.

Keep the handoff under about 200 words and use exactly these fields:
- `status:` success / partial / not_found
- `incident_group_id:` exact group ID
- `is_likely_common_incident:` true / false / uncertain
- `leading_hypothesis:` one hypothesis
- `confidence:` high / medium / low plus backend score when available
- `supporting_evidence:` maximum three short facts combining timing/dependency/history
- `global_evidence:` one anonymized aggregate fact only
- `alternative:` strongest alternative only
- `validate_next:` maximum two checks needed to confirm or reject the leading hypothesis
- `freshness_gaps:` one line

Correlation is not proof. Do not repeat the full sequence, every dependency, every ranked cause or all historical counts in handoff mode.

## Normal specialist response
Explain exact sequence, shared dependency/blast radius, local resolved correlation history, anonymized global patterns, ranked hypotheses, next validation, and freshness.
Correlation is not proof. Do not claim physical root cause is confirmed without validating evidence.
