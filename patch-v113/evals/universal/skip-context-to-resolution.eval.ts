import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "After the OEM checklist is exhausted, an operator without a ticket or network identifier can explicitly skip current context and continue to anonymized past-resolution evidence.",
  tags: ["universal", "v113", "multi-turn", "resolution", "no-identifier"],
  async test(t) {
    const first = await t.send(
      "ENTRY_MODE: full. Alarm identifier DEMO-PWR-FAIL. This is the synthetic demo walkthrough. Show me the approved OEM checklist."
    );

    first.succeeded();
    first.calledTool("get_oem_alarm_guidance", { count: 1 });
    first.messageIncludes(/Which approved OEM checks|checklist|already completed/i);

    const second = await t.send(
      "Every applicable OEM checklist item has been completed and the issue is still present."
    );

    second.succeeded();
    second.noFailedActions();
    second.notCalledTool("get_universal_context");
    second.notEvent("subagent.called");
    second.calledTool("update_investigation_state", {
      count: (count) => count >= 1,
    });
    second.messageIncludes(/show past resolutions|ticket|network\/system identifier/i);

    const third = await t.send(
      "Operator response: I don't have either - show past resolutions."
    );

    third.succeeded();
    third.noFailedActions();
    third.notCalledTool("get_universal_context");
    third.calledSubagent("resolution-intelligence", { count: 1 });
    third.messageIncludes(/historical|past|similar|resolution/i);
    third.messageIncludes(/evidence|hypothesis|pattern|not proof/i);
  },
});
