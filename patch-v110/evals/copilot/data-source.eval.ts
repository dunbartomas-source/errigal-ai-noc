import { defineEval } from "eve/evals";

export default defineEval({
  description: "Copilot reads incident evidence through the explicit read-only data-source adapter and reports the current synthetic source without changing the one-pack/no-subagent architecture.",
  tags: ["copilot", "data-source", "architecture", "regression"],
  async test(t) {
    await t.send(
      "Run the end-to-end AI-NOC Copilot workflow for tenant customer-a and ticket A-2000. Use the standard evidence-led read-only response."
    );

    t.succeeded();
    t.noFailedActions();
    t.calledTool("get_copilot_incident_evidence_pack", {
      input: { tenant_id: "customer-a", ticket_id: "A-2000" },
      output: (value) => {
        const output = value as any;
        return output?.status === "success" &&
          output?.data_source?.id === "synthetic" &&
          output?.data_source?.mode === "read_only" &&
          output?.data_source?.configured === true &&
          output?.is_live === false;
      },
      count: 1
    });
    t.notEvent("subagent.called");
  }
});
