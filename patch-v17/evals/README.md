# Errigal AI-NOC Eve evals

These evals are the regression gate for the default single-pass AI-NOC Copilot.

They intentionally use deterministic assertions first:

- exactly one `get_copilot_incident_evidence_pack` call for a standard Copilot incident;
- no subagent delegation in the default Copilot path;
- privacy metadata remains sanitized before model access;
- the assistant never claims it executed an operational action;
- unknown tickets produce an evidence gap instead of fabricated facts.

Run locally or against a deployment:

```bash
eve eval
eve eval copilot
eve eval copilot --url https://errigal-ai-noc.vercel.app
eve eval copilot --url https://errigal-ai-noc.vercel.app --strict
```

The suite should expand with additional synthetic incident fixtures before live-data pilot testing. Each new fixture should define an expected correlation decision, leading root-cause hypothesis, required/forbidden actions, privacy expectation, and closure criteria.
