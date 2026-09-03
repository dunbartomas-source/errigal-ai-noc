import { z } from "zod";
import { defineDynamic, defineTool } from "eve/tools";
import { getOemAlarmPlaybook } from "../lib/oem_playbook_source";
import { investigationState } from "../lib/investigation_state";

function latestUserText(messages: any[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) => (part?.type === "text" ? String(part.text ?? "") : ""))
        .join("\n");
    }
  }
  return "";
}

function entryModeFromText(text: string) {
  const match = text.match(
    /ENTRY_MODE:\s*(full|oem_troubleshooting|context_investigation|correlation|resolution)/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function hasToolMessage(messages: any[], toolName: string): boolean {
  return messages.some((message: any) =>
    Array.isArray(message?.content)
      ? message.content.some((part: any) => part?.toolName === toolName)
      : false,
  );
}

function oemSkillLoaded(messages: any[]): boolean {
  return messages.some((message: any) =>
    Array.isArray(message?.content)
      ? message.content.some((part: any) => {
          if (part?.toolName !== "load_skill") return false;
          const serialized = JSON.stringify(part);
          return (
            serialized.includes("oem-guided-troubleshooting") ||
            serialized.includes("OEM Guided Troubleshooting")
          );
        })
      : false,
  );
}

function mergeChecklist(existing: any[], incoming: any[]) {
  const currentById = new Map(existing.map((check: any) => [check.id, check]));
  return incoming.map((check: any) => {
    const prior = currentById.get(check.id) as any;
    return prior
      ? { ...check, status: prior.status, observation: prior.observation }
      : { ...check, status: "unknown" as const };
  });
}

export default defineDynamic({
  events: {
    "step.started": async (_event, ctx) => {
      const messages = ctx.messages as any[];
      const text = latestUserText(messages);
      const explicitEntryMode = entryModeFromText(text);
      const state = investigationState.get();

      // OEM evidence is fetched once and then persisted as canonical session state.
      if (state.oem_guidance_loaded || hasToolMessage(messages, "get_oem_alarm_guidance")) {
        return null;
      }

      // Direct Resolution deliberately bypasses first-line OEM execution.
      if (explicitEntryMode === "resolution") return null;
      if (
        state.entry_mode === "resolution" &&
        (state.current_stage === "resolution" ||
          ["complete", "not_applicable", "operator_override"].includes(
            state.stage_status.oem_troubleshooting,
          ))
      ) {
        return null;
      }

      // The deterministic lookup is exposed only inside the approved OEM Skill.
      if (!oemSkillLoaded(messages)) return null;

      return defineTool({
        description:
          "Read the controlled Trap_KnowledgeTable guidance for one alarm identifier. Exact normalized alarm_identifier is the matching key. Software/firmware version is intentionally not a filter. Equivalent version rows deduplicate; materially conflicting controlled guidance returns data_conflict. Never fuzzy-match.",
        inputSchema: z.object({ alarm_identifier: z.string().min(1) }).strict(),
        execute: async ({ alarm_identifier }) => {
          const result = await getOemAlarmPlaybook(alarm_identifier);
          const now = new Date().toISOString();

          if (result.status === "success") {
            const incomingChecks = result.checklist.map((step) => ({
              id: step.id,
              text: step.instruction,
              source_field: step.source_field,
            }));
            investigationState.update((current) => ({
              ...current,
              entry_mode: (explicitEntryMode as any) ?? current.entry_mode,
              current_stage: "oem_troubleshooting",
              alarm_identifier:
                result.canonical_alarm_identifier || result.alarm_identifier,
              oem: result.oem ?? current.oem,
              trap_name: result.trap_name ?? current.trap_name,
              alarm_description: result.description ?? current.alarm_description,
              oem_guidance_loaded: true,
              checks: mergeChecklist(current.checks, incomingChecks),
              stage_status: {
                ...current.stage_status,
                oem_troubleshooting:
                  current.stage_status.oem_troubleshooting === "complete"
                    ? "complete"
                    : "active",
              },
              issue_status:
                current.issue_status === "unknown" ? "active" : current.issue_status,
              updated_at: now,
            }));
          } else {
            const gap =
              result.status === "data_conflict"
                ? `Controlled OEM guidance conflict for alarm identifier ${result.canonical_alarm_identifier}. No version row was selected automatically.`
                : `No controlled OEM guidance was available for alarm identifier ${alarm_identifier.trim()}.`;
            investigationState.update((current) => ({
              ...current,
              entry_mode: (explicitEntryMode as any) ?? current.entry_mode,
              current_stage: "oem_troubleshooting",
              alarm_identifier:
                result.canonical_alarm_identifier || alarm_identifier.trim(),
              evidence_gaps: [...new Set([...current.evidence_gaps, gap])],
              updated_at: now,
            }));
          }

          if (result.status !== "success") return result;
          return {
            ...result,
            evidence_class: "structured_oem_guidance",
          };
        },
        toModelOutput(output: any) {
          if (output.status !== "success") {
            return {
              type: "json" as const,
              value: {
                status: output.status,
                alarm_identifier: output.alarm_identifier,
                canonical_alarm_identifier: output.canonical_alarm_identifier,
                source_row_count: output.source_row_count ?? 0,
                data_conflicts: Array.isArray(output.data_conflicts)
                  ? output.data_conflicts.slice(0, 5)
                  : [],
                matching_policy: output.matching_policy,
                warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
              },
            };
          }

          return {
            type: "json" as const,
            value: {
              status: output.status,
              evidence_class: output.evidence_class,
              alarm_identifier: output.alarm_identifier,
              canonical_alarm_identifier: output.canonical_alarm_identifier,
              oem: output.oem,
              trap_name: output.trap_name,
              description: output.description,
              remedy: output.remedy,
              technical_info: output.technical_info,
              checklist: Array.isArray(output.checklist)
                ? output.checklist.slice(0, 20).map((item: any) => ({
                    id: item.id,
                    text: String(item.instruction ?? item.text ?? "").slice(0, 500),
                    source_field: item.source_field,
                  }))
                : [],
              source_row_count: output.source_row_count,
              logical_playbook_count: output.logical_playbook_count,
              deduplicated_row_count: output.deduplicated_row_count,
              matching_policy: output.matching_policy,
              warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
            },
          };
        },
      });
    },
  },
});
