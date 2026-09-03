import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "Direct Correlation entry gathers deterministic current context and invokes the Correlation specialist once without automatically chaining into Resolution Intelligence in the same turn.",
  tags: ["universal", "v113", "direct-entry", "correlation"],
  async test(t) {
    const turn = await t.send(
      "ENTRY_MODE: correlation. Alarm identifier PWR-FAIL. I suspect PWR-FAIL, INPUT-VOLT-LOW and COMM-LOSS may be one incident. Correlate the available evidence."
    );

    turn.succeeded();
    turn.noFailedActions();
    turn.calledTool("get_universal_context", { count: 1 });
    turn.calledSubagent("correlation-root-cause", { count: 1 });
    turn.notEvent("subagent.called", {
      data: { name: "resolution-intelligence" },
    });
    turn.messageIncludes(/related|relationship|correlation|common/i);
    turn.messageIncludes(/evidence|cause|validation|confidence/i);
  },
});
