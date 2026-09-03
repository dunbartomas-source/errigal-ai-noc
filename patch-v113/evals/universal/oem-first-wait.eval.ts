import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "Full investigation starts with controlled OEM guidance and waits when the operator has completed no troubleshooting, without prematurely using context/history specialists.",
  tags: ["universal", "v113", "oem", "cost-control"],
  async test(t) {
    const turn = await t.send(
      "ENTRY_MODE: full. The alarm identifier is PWR-FAIL. I have not completed any troubleshooting yet. Start the investigation."
    );

    turn.succeeded();
    turn.noFailedActions();
    turn.loadedSkill("oem-guided-troubleshooting");
    turn.calledTool("get_oem_alarm_guidance", {
      input: { alarm_identifier: "PWR-FAIL" },
      count: 1,
    });
    turn.notCalledTool("get_universal_context");
    turn.notCalledTool("get_copilot_incident_evidence_pack");
    turn.notEvent("subagent.called");
    turn.messageIncludes(/OEM|manufacturer|approved/i);
    turn.messageIncludes(/check|troubleshoot|verify/i);
  },
});
