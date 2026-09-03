import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "Direct Resolution entry bypasses already-completed OEM/context stages, invokes only Resolution Intelligence, and does not leak historical ticket identifiers.",
  tags: ["universal", "v113", "direct-entry", "resolution", "privacy"],
  async test(t) {
    const turn = await t.send(
      "ENTRY_MODE: resolution. Alarm identifier PWR-FAIL. I confirm the applicable OEM troubleshooting and basic network-context investigation are already complete. I already verified input voltage and reseated the power terminal; the issue is still active. Find the strongest past resolution evidence now."
    );

    turn.succeeded();
    turn.noFailedActions();
    turn.notCalledTool("get_oem_alarm_guidance");
    turn.notCalledTool("get_universal_context");
    turn.calledSubagent("resolution-intelligence", {
      count: 1,
      output: (value) => {
        const text = JSON.stringify(value);
        return (
          !/A-1781|A-1816|A-1993|A-2032|A-1732|A-1838|A-1904|A-2071|A-2090/.test(text) &&
          !/customer a core site|customer a distribution site/i.test(text)
        );
      },
    });
    turn.notEvent("subagent.called", {
      data: { name: "correlation-root-cause" },
    });
    turn.messageIncludes(/historical|similar|past|resolved/i);
    turn.messageIncludes(/evidence|pattern|comparable/i);
  },
});
