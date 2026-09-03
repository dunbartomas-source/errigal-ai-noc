export const runtime = "nodejs";

function dataMode() {
  return String(process.env.AI_NOC_DATA_SOURCE ?? "synthetic").toLowerCase();
}

export async function GET() {
  const source = dataMode();
  const configured =
    source === "synthetic" || Boolean(String(process.env.AI_NOC_DATA_SERVICE_URL ?? "").trim());

  return Response.json({
    status: "ok",
    product: "Errigal AI-NOC",
    framework: "eve",
    version: "1.13.0",
    mode: "read-only",
    experience: "universal-agentic-conversation",
    data_mode: source,
    model: process.env.DEEPSEEK_API_KEY ? "deepseek/deepseek-chat" : "deepseek/deepseek-v3.2",
    universal_agentic: {
      active: true,
      primary_agent: "ai-noc-investigator",
      root_tools: [
        "get_investigation_state",
        "update_investigation_state",
        "get_oem_alarm_guidance",
        "get_universal_context",
      ],
      skills: [
        "oem-guided-troubleshooting",
        "universal-context-investigation",
        "resolution-validation",
        "incident-handover",
        "oem-escalation",
      ],
      specialists: ["correlation-root-cause", "resolution-intelligence"],
      generic_agent_delegation: false,
      mode: "read_only",
    },
    tool_audit: {
      active: true,
      storage: "durable_session_state",
      retention: "last_100_events_per_session",
      payload_policy: "metadata_only",
      covered_tools: [
        "get_investigation_state",
        "update_investigation_state",
        "get_oem_alarm_guidance",
        "get_universal_context",
        "search_resolution_history",
      ],
    },
    data_adapter: {
      active: source,
      mode: "read_only",
      configured,
    },
  });
}
