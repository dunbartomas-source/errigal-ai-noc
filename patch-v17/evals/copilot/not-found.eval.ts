import { defineEval } from "eve/evals";

export default defineEval({
  description: "An unknown ticket returns an evidence gap instead of fabricated incident facts or fallback subagent calls.",
  tags: ["copilot", "not-found", "regression"],
  async test(t) {
    await t.send(
      "Run the end-to-end AI-NOC Copilot workflow for tenant customer-a and ticket A-9999. Do not invent missing evidence."
    );

    t.succeeded();
    t.noFailedActions();
    t.calledTool("get_copilot_incident_evidence_pack", {
      input: { tenant_id: "customer-a", ticket_id: "A-9999" },
      output: { status: "not_found", source_records: 0 },
      count: 1
    });
    t.notEvent("subagent.called");
    t.maxToolCalls(1);
    t.messageIncludes(/not found|no matching|insufficient|unavailable|cannot/i);
  }
});
