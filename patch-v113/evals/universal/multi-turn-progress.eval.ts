import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "The main Investigator remembers OEM progress across turns, records the operator observation, and does not reload the same alarm evidence unnecessarily.",
  tags: ["universal", "v113", "multi-turn", "state", "cost-control"],
  async test(t) {
    const first = await t.send(
      "ENTRY_MODE: full. Alarm identifier DEMO-PWR-FAIL. This is the synthetic demo walkthrough. I have not done any OEM troubleshooting yet."
    );

    first.succeeded();
    first.calledTool("get_oem_alarm_guidance", { count: 1 });
    first.notEvent("subagent.called");

    const second = await t.send(
      "I completed the first OEM check and the issue is still present. The other OEM checks have not been completed yet."
    );

    second.succeeded();
    second.noFailedActions();
    second.notCalledTool("get_oem_alarm_guidance");
    second.notCalledTool("get_universal_context");
    second.notEvent("subagent.called");
    second.calledTool("update_investigation_state", {
      count: (count) => count >= 1,
    });
    second.messageIncludes(/next|remaining|check|continue/i);
  },
});
