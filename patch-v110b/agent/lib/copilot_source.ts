import { COPILOT_CASES } from "./copilot_cases";

export type CopilotSourceMode = "synthetic" | "keystats";

export type CopilotSourceResult =
  | {
      status: "success";
      source: CopilotSourceMode;
      read_only: true;
      is_live: boolean;
      case_data: any;
      warnings: string[];
    }
  | {
      status: "not_found" | "source_unavailable";
      source: CopilotSourceMode;
      read_only: true;
      is_live: boolean;
      case_data: null;
      warnings: string[];
    };

function configuredSource(): CopilotSourceMode {
  const requested = String(process.env.AI_NOC_DATA_SOURCE ?? "synthetic").toLowerCase();
  return requested === "keystats" ? "keystats" : "synthetic";
}

export async function getCopilotIncidentCase(tenantId: string, ticketId: string): Promise<CopilotSourceResult> {
  const source = configuredSource();

  if (source === "keystats") {
    return {
      status: "source_unavailable",
      source,
      read_only: true,
      is_live: false,
      case_data: null,
      warnings: [
        "KeyStats data source selected but the read-only adapter is not configured. No synthetic fallback was used."
      ]
    };
  }

  const selected = COPILOT_CASES[ticketId];
  if (!selected || selected.tenant_id !== tenantId) {
    return {
      status: "not_found",
      source,
      read_only: true,
      is_live: false,
      case_data: null,
      warnings: ["No matching demo ticket"]
    };
  }

  return {
    status: "success",
    source,
    read_only: true,
    is_live: false,
    case_data: selected,
    warnings: []
  };
}
