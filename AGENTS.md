# Errigal AI-NOC v1.13

## Source of truth

- Work on `feature/ai-noc-universal-agentic-workflow`.
- The canonical v1.13 source is under `patch-v113/` and is applied by `prepare-source.mjs -> fix-source.mjs -> apply-v113.mjs`.
- Do not simplify that reconstruction chain until the pilot behavior and evaluations are complete.
- Keep the production Vercel project `errigal-ai-noc` untouched unless Tomas explicitly approves a production action.
- Preview work belongs to `errigal-ai-noc-source`. The read-only data service is `errigal-ai-noc-data-service`.

## Locked architecture

- One durable root agent: AI-NOC Investigator.
- Procedures are the five existing Skills: OEM troubleshooting, universal context, resolution validation, incident handover, and OEM escalation.
- The only specialist subagents are `correlation-root-cause` and `resolution-intelligence`.
- Tools retrieve deterministic facts. Skills define procedures. Subagents handle substantial isolated reasoning.
- Use at most one specialist invocation per ordinary user turn and pass only the compact evidence it needs.
- Ask approved systems before asking the operator for retrievable facts.

## Safety and privacy

- The product is strictly read-only. It may recommend or draft, but it must not operate devices, alarms, configurations, software, tickets, communications, dispatch, or shared knowledge.
- Never mark an issue resolved without explicit operator confirmation of actual recovery.
- Trap Knowledge matching is exact after trim/NFKC/case-folding and preserves separators. Never fuzzy-match or use the mixed `comment` field. Conflicting guidance fails closed.
- Sanitize historical resolution evidence deterministically before model access. Never expose cross-customer identifiers or raw notes; omit uncertain notes.
- Audit only bounded metadata. Never audit raw evidence, prompts, customer/device/ticket identifiers, or notes.
- Missing data is an evidence gap, not evidence that nothing happened.

## Validation

Run these before proposing a Preview change:

1. `npm install --no-audit --no-fund`
2. `npm run validate:v113`
3. `npm run build`
4. Run the strict v1.13 conversational evaluations against the protected matching Preview through the existing GitHub workflow.

Do not run an LLM conversation for every Trap Knowledge identifier; use deterministic catalogue coverage for the full dataset and representative conversational cases for behavior.
