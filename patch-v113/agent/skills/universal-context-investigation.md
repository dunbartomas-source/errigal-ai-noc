# Universal Context Investigation

Use this Skill after OEM troubleshooting is exhausted in the normal workflow, or when the operator directly enters network-context investigation.

## Principle

Ask systems before humans. Use `get_universal_context` to retrieve facts the platform can know. Ask the operator only for evidence the systems cannot provide.

In the normal full workflow, the operator supplies the network/system identifier after completing the OEM checklist. Use that network/system identifier as the primary lookup key and retain the original alarm identifier as the incident anchor. Do not retry a previously failed alarm-only lookup.

## Standard pilot windows

- alarm history: 14 days
- software/configuration changes: 7 days

Automatically retrieve active alarms plus the 14-day alarm history and 7-day software/configuration change history available for that system. If the adapter does not expose one of those datasets, name it as an evidence gap instead of asking the operator to reconstruct system history from memory.

The tool returns the actual evidence available from the current adapter and explicitly lists gaps. Never imply that a missing dataset was checked successfully.

## Assess these questions

1. Did a software, configuration or maintenance change precede the issue?
2. Did another alarm precede the target alarm and plausibly represent a precursor/upstream event?
3. Is the parent or upstream element affected?
4. Are multiple devices showing the same symptom?
5. Does topology indicate a shared dependency?
6. Does the evidence materially justify the Correlation & Root Cause Analyst?

Use the deterministic ordered timeline rather than narrating raw rows.

A temporal relationship is evidence, not proof.

Return or communicate concisely:

- confirmed observations
- possible relationships
- contradicting evidence
- missing information
- whether deeper correlation is required
- recommended next stage

If the context is sufficient and complex correlation adds little, proceed directly to Resolution Intelligence in the full workflow.
