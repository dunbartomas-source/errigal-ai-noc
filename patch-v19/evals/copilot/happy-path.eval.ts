import { defineEval } from "eve/evals";

export default defineEval({
  description: "Copilot uses one combined evidence pack, loads the power-fault procedure once, uses no subagents, and returns the expected power-fault decision support for A-2000.",
  tags: ["copilot", "regression", "architecture", "skills"],
  async test(t) {
    await t.send(
      "Run the end-to-end AI-NOC Copilot workflow for tenant customer-a and ticket A-2000. Use the standard evidence-led read-only response."
    );

    t.succeeded();
    t.noFailedActions();
    t.calledTool("get_copilot_incident_evidence_pack", {
      input: { tenant_id: "customer-a", ticket_id: "A-2000" },
      count: 1
    });
    t.loadedSkill("power-fault-troubleshooting", { count: 1 });
    t.toolOrder(["get_copilot_incident_evidence_pack", "load_skill"]);
    t.notEvent("subagent.called");
    t.maxToolCalls(2);
    t.messageIncludes(/incident summary/i);
    t.messageIncludes(/power|PSU/i);
    t.messageIncludes(/troubleshoot|resolution/i);
    t.messageIncludes(/confidence|freshness/i);
  }
});
