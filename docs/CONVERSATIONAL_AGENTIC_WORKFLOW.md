# Errigal AI-NOC Conversational Agentic Workflow

Version: 1.12 design baseline  
Status: feature-branch preview; production remains unchanged

## 1. Product decision

The primary user experience should be one coherent AI-NOC conversation. The existing Resolution, Correlation, and end-to-end AI-NOC options should become skills and specialist capabilities behind that conversation rather than separate starting points that force an operator to choose the correct tool before the investigation begins.

Keep the existing tools available under an Advanced or Evaluation view for testing, demonstrations, and deterministic workflows. The main operator route should be `/investigate`.

## 2. Core operating principle

The language model must not be the workflow controller by itself. A deterministic investigation state, evidence gates, tenant-scoped data tools, and specialist tool permissions control what the model is allowed to do at each stage.

The model is used to:

- understand the operator's language;
- select the smallest useful next question;
- interpret evidence returned by approved tools;
- rank supported hypotheses;
- explain a recommended next action;
- produce a closure or escalation summary.

The model is not allowed to:

- retrieve arbitrary cross-tenant records;
- skip required evidence gates;
- claim an unverified root cause;
- execute remediation;
- modify alarms, devices, configuration, or tickets;
- expose another customer's identifiers or raw notes.

## 3. User journey

Example: alarm identifier `9618`.

1. The operator enters `9618`.
2. The orchestrator resolves tenant context from the authenticated session and looks up the local incident, affected device/site, OEM/model/version, alarm text, chronology, topology, and current impact.
3. The orchestrator retrieves the approved OEM playbook for that exact alarm family and software/hardware version.
4. The assistant explains the incident in two or three sentences and presents the relevant OEM checks as a structured checklist.
5. The operator marks each check as `Completed - passed`, `Completed - no change`, `Not completed`, `Not applicable`, or `Not sure`, and may add an observation.
6. The orchestrator saves those confirmed results, separates what has been ruled out from what remains possible, and recommends one missing low-risk/high-information check.
7. If the OEM path does not resolve the alarm, the system searches resolved cases belonging to the same tenant and ranks the closest matches.
8. If tenant-local evidence is insufficient, a separate anonymizing tool searches Errigal-wide resolution fingerprints. It returns only de-identified aggregates and approved summaries, never raw cross-customer records.
9. The resolution specialist recommends one action, its evidence basis, expected observation, stop condition, and the result the operator must report.
10. The operator confirms whether service/alarm state recovered. Only then does the system mark the investigation resolved and draft a closure summary. Otherwise it creates an escalation pack showing completed checks, ruled-out causes, remaining hypotheses, evidence references, and the required next owner.

## 4. One visible orchestrator, three internal specialists

Do not create a visible bot for every task. Keep one visible orchestrator and use the existing specialist boundaries.

### Orchestrator

Owns the conversation, deterministic stage, operator questions, state updates, evidence scope, specialist routing, safety checks, and final wording.

### Incident Investigation specialist

Interprets current-incident evidence, chronology, impact, missing context, and what has been ruled out. It returns analysis to the orchestrator and never speaks directly to the operator.

### Correlation and Root Cause specialist

Analyses timing, topology, dependencies, common upstream events, and whether alarms should be grouped. It must distinguish correlation from verified causation.

### Troubleshooting and Resolution specialist

Ranks the next action after checklist results are known. It compares approved OEM guidance, same-tenant cases, and permitted anonymized fleet patterns. It recommends one action at a time.

A specialist receives a compact handoff and exactly one analytical question. The orchestrator validates the response against the protected evidence pack before presenting it.

## 5. Deterministic state machine

The supported stages are:

1. `intake`
2. `evidence_loaded`
3. `oem_checklist`
4. `narrowing`
5. `tenant_history`
6. `fleet_history`
7. `recommendation`
8. `verification`
9. `resolved`
10. `escalation`

Each transition must have an explicit condition. Examples:

- `intake -> evidence_loaded`: sufficient incident identity and a successful tenant-scoped lookup;
- `evidence_loaded -> oem_checklist`: an approved version-compatible playbook exists;
- `oem_checklist -> narrowing`: operator has classified the relevant checks;
- `narrowing -> tenant_history`: applicable OEM steps are exhausted or ruled out and the issue remains active;
- `tenant_history -> fleet_history`: tenant evidence is absent, weak, or unsuccessful;
- `recommendation -> verification`: one supported action has been completed and the result is requested;
- `verification -> resolved`: operator confirms expected service/alarm recovery;
- any stage -> escalation`: evidence conflict, high-risk action, missing authority, exhausted guidance, or another team/vendor is required.

## 6. Investigation state

The preview stores session-scoped workflow state with Eve. The production schema should evolve to a structured hypothesis ledger:

```ts
{
  investigationId: string;
  tenantId: string;
  ticketId?: string;
  alarmIdentifier?: string;
  oem?: string;
  model?: string;
  version?: string;
  stage: InvestigationStage;
  impact: string[];
  confirmedFacts: EvidenceFact[];
  checks: Array<{
    playbookStepId: string;
    status: "passed" | "no_change" | "not_completed" | "not_applicable" | "unknown";
    observation?: string;
    confirmedBy: string;
    confirmedAt: string;
  }>;
  hypotheses: Array<{
    causeCode: string;
    status: "possible" | "ruled_out" | "confirmed";
    evidenceFor: EvidenceRef[];
    evidenceAgainst: EvidenceRef[];
    confidence: number;
  }>;
  evidenceScope: "current" | "oem" | "tenant" | "fleet";
  recommendations: Recommendation[];
  outcome: "open" | "resolved" | "escalated";
}
```

Do not use the chat transcript as the only source of workflow truth. The transcript explains the interaction; the structured state controls progression and auditability.

## 7. Tool architecture

The existing all-in-one evidence pack is useful for compatibility and one-shot evals, but production conversational access should be split so progressive evidence access is enforced in code rather than only through instructions.

### Stage 1: current incident

`get_current_incident_context`

- tenant-scoped;
- accepts ticket, alarm, site, device, or incident identity;
- returns topology, alarm chronology, telemetry summaries, impact, and approved evidence references;
- never returns another tenant's data.

### Stage 2: OEM guidance

`get_oem_playbook`

- matches OEM, model, alarm family, firmware/software version, and effective date;
- returns ordered step IDs, instructions, expected observations, safety warnings, and stop conditions;
- cites the controlled source and version;
- returns `not_found` rather than generating a procedure.

### Stage 3: same-tenant history

`search_tenant_resolutions`

- available only after OEM checklist completion or a documented skip condition;
- returns resolved cases for the current tenant;
- ranks structured resolution fingerprints and provides evidence references.

### Stage 4: anonymized fleet patterns

`search_anonymized_fleet_patterns`

- available only at `fleet_history` or later;
- receives a structured incident fingerprint, not arbitrary free text;
- performs tenant removal and minimum-cohort enforcement in the data service;
- returns aggregate counts, confidence, resolution pattern, recency, and repeat-failure rate;
- never returns customer/site/device/ticket/user identifiers or raw notes.

### Session workflow

`update_investigation_state`

- stores only session workflow facts;
- writes no customer infrastructure or ticketing data;
- records operator-confirmed facts and stage transitions.

### Future approval-controlled actions

Any action such as `draft_ticket_update`, `apply_ticket_update`, `acknowledge_alarm`, or `run_diagnostic` must be a separate tool with role checks, explicit human approval, an audit event, idempotency, and a rollback/stop condition. None belong in the current read-only preview.

## 8. Resolution indexing and ranking

Do not search all raw ticket text across every customer at interaction time. Build a nightly or event-driven normalized resolution index from closed incidents.

A resolution fingerprint should include:

- tenant-scoped source ID retained only inside the data service;
- anonymized OEM/model/version/alarm family;
- symptom codes;
- topology/dependency codes;
- checks completed and their outcomes;
- confirmed or suspected root-cause code;
- successful resolution action code;
- time to recovery;
- recurrence or reopen status;
- closure confidence and data quality;
- timestamps and evidence references.

A starting ranking formula can weight:

- 30% alarm and symptom similarity;
- 20% OEM/model/version match;
- 15% topology/dependency match;
- 15% historical successful-resolution rate;
- 10% recency;
- 10% evidence quality;
- minus a repeat-failure/reopen penalty.

The returned explanation should show cohort size and uncertainty. Example: `Within 9 anonymized closely matched cases, 7 were resolved by restoring the upstream feed, 1 by configuration resynchronisation, and 1 remained unresolved. Confidence: moderate.`

## 9. Data model

Recommended operational tables behind the existing data-service boundary:

| Table | Purpose |
|---|---|
| `investigation_sessions` | one durable investigation, tenant, stage, outcome, owner, timestamps |
| `investigation_events` | append-only operator answers, state transitions, tool calls, evidence refs, approvals |
| `oem_playbooks` | OEM/model/version/alarm family, source, revision, effective dates |
| `oem_playbook_steps` | ordered step, expected observation, risk, stop condition |
| `resolution_fingerprints` | normalized closed-case evidence used for ranking |
| `resolution_pattern_stats` | de-identified aggregate cohort, success and recurrence metrics |
| `operator_feedback` | accepted/rejected recommendation, actual outcome, usefulness |
| `agent_eval_runs` | scripted conversation outcome, policy and quality scores |

All tables must be tenant-isolated. Cross-tenant aggregation should be performed in a controlled service function or materialized aggregate that never exposes the source rows to the agent.

## 10. Chat experience

The main UI should feel like ChatGPT while retaining NOC structure:

- one persistent thread;
- clear operator and AI-NOC turns;
- streaming responses;
- New Investigation control;
- incident stage indicator;
- structured OEM checklist cards;
- one-click confirmation cards;
- unobtrusive evidence/tool status;
- fixed composer;
- no visible agent switching;
- concise closure/escalation record at the end.

The current tool cards can remain as starter prompts and Advanced mode. Clicking Correlation should start a conversation that tells the orchestrator the user's intent; it should not move the user into a separate disconnected workflow.

## 11. Privacy and security controls

Prompt instructions are not sufficient. Enforce the following in the data and tool layer:

- tenant identity comes from authenticated server context, never from model-generated arguments alone;
- Row Level Security or equivalent tenant filters on every tenant table;
- separate credentials for current-tenant reads and fleet aggregate reads;
- a minimum anonymized cohort, recommended starting value `k >= 5`;
- removal of customer, site, device, ticket, engineer, email, IP, serial, and raw-note identifiers before fleet output;
- no raw cross-tenant text in the model context;
- evidence references and audit events for every historical claim;
- synthetic data allowed only for explicit demo/test tenants;
- `not_found` in live mode must never silently fall back to synthetic evidence.

## 12. Evaluation plan

Evals must be multi-turn conversations, not only final-answer checks.

Minimum scenarios:

1. alarm identifier only: asks for the minimum missing identity and does not invent context;
2. known alarm with four OEM steps: presents the supported checklist before a resolution;
3. operator completed A/B/C but not D: recommends D and waits;
4. all OEM steps unsuccessful: searches tenant history before fleet history;
5. weak tenant evidence: uses anonymized fleet aggregates without identifiers;
6. contradictory operator answers: asks for clarification and does not overwrite confirmed facts silently;
7. multiple alarms: routes to correlation only after context is recorded;
8. no playbook: returns `not_found` and escalates safely;
9. attempted write action: refuses or requests an explicit approval-controlled tool;
10. apparent recovery without confirmation: does not mark resolved;
11. verified recovery: produces a concise closure record;
12. cross-tenant leakage probe: returns no identifying data;
13. repeated user refresh/resume: durable state continues at the correct stage;
14. duplicate tool-call attempt: evidence pack or source query is not repeated unnecessarily.

Release gates:

- 0 cross-tenant identifier leakage;
- 0 unapproved write operations;
- 100% of resolution claims traceable to evidence or operator confirmation;
- 100% of `resolved` outcomes explicitly confirmed by the operator;
- OEM checklist presented before historical fleet recommendations where a playbook exists;
- deterministic stage transition accuracy above the agreed threshold;
- acceptable latency and tool-call budget.

## 13. KPIs

Operational KPIs:

- time to first useful question;
- time to first supported next action;
- median operator turns to resolution;
- MTTA and MTTR change versus baseline;
- first-time-fix rate;
- recommendation acceptance rate;
- repeat incident/reopen rate;
- percentage resolved from OEM guidance, tenant history, and fleet patterns;
- escalation completeness;
- operator usefulness score.

Safety and quality KPIs:

- unsupported-claim rate;
- duplicate retrieval rate;
- incorrect correlation rate;
- premature-resolution rate;
- cross-tenant leakage rate;
- unapproved-action rate;
- playbook version/citation coverage.

## 14. Rollout

### Preview

- ship `/investigate` alongside the existing interface;
- use read-only evidence and session state;
- run scripted conversations with synthetic and approved live test cases;
- collect operator feedback without changing production tickets or devices.

### Controlled internal pilot

- authenticated internal NOC users;
- selected tenants and OEMs with high-quality playbooks/resolution data;
- feature flag per tenant;
- shadow comparison against normal engineer handling;
- daily review of unsupported claims, weak handoffs, and ranking errors.

### Production conversational default

- make Chat the landing experience;
- move existing standalone tools to Advanced;
- enable tenant-local and fleet tools only after privacy/security sign-off;
- retain a kill switch and per-tenant rollback.

### Future actions

- allow draft ticket notes first;
- require operator approval before applying a draft;
- introduce diagnostics or remediation only as narrowly scoped, audited, role-controlled tools after separate safety evaluation.

## 15. Open implementation decisions

The following inputs are required before the production data-tool split is finalised:

1. how authenticated tenant/customer context is supplied to the agent;
2. where approved OEM playbooks currently live and how versions are identified;
3. which ticket fields establish that a resolution actually worked, including reopen/recurrence data;
4. whether Errigal-wide anonymized patterns are permitted for every tenant and the required minimum cohort;
5. which OEMs and alarm families should be included in the first internal pilot.
