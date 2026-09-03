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
      const text = latestUserText(ctx.messages as any[]);
      const explicitEntryMode = entryModeFromText(text);
      const state = investigationState.get();

      // Direct Resolution deliberately bypasses first-line OEM execution on its
      // entry turn. If the operator later asks to go back through OEM steps, a
      // later turn can expose this tool again after loading the OEM Skill.
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

      // The OEM procedure is a Skill by design. Do not expose the underlying
      // data tool until that approved procedure has actually been loaded.
      if (!oemSkillLoaded(ctx.messages as any[])) return null;

      return defineTool({
        description:
          "Read the controlled OEM alarm guidance for one alarm identifier. Alarm identifier is the matching key; software/firmware version is intentionally not required. Never use this tool for fuzzy matching.",
        inputSchema: z.object({ alarm_identifier: z.string().min(1) }).strict(),
        execute: async ({ alarm_identifier }) => {
          const result = await getOemAlarmPlaybook(alarm_identifier);
          const now = new Date().toISOString();

          if (result.status === "success") {
            const incomingChecks = result.troubleshooting_steps.map((step) => ({
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
              alarm_description: result.alarm_context[0] ?? current.alarm_description,
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
            investigationState.update((current) => ({
              ...current,
              entry_mode: (explicitEntryMode as any) ?? current.entry_mode,
              alarm_identifier: alarm_identifier.trim(),
              evidence_gaps: [
                ...new Set([
                  ...current.evidence_gaps,
                  `No controlled OEM guidance was available for alarm identifier ${alarm_identifier.trim()}.`,
                ]),
              ],
              updated_at: now,
            }));
          }

          if (result.status !== "success") return result;
          return {
            ...result,
            checklist: result.troubleshooting_steps.map((step) => ({
              id: step.id,
              text: step.instruction,
              source_field: step.source_field,
            })),
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
                warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
                matching_policy: output.matching_policy,
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
              alarm_context: Array.isArray(output.alarm_context)
                ? output.alarm_context.slice(0, 6)
                : [],
              remedy_information: Array.isArray(output.remedy_information)
                ? output.remedy_information.slice(0, 6)
                : [],
              checklist: Array.isArray(output.checklist)
                ? output.checklist.slice(0, 20).map((item: any) => ({
                    id: item.id,
                    text: String(item.text ?? "").slice(0, 500),
                    source_field: item.source_field,
                  }))
                : [],
              source_row_count: output.source_row_count,
              matching_policy: output.matching_policy,
              warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 5) : [],
            },
          };
        },
      });
    },
  },
});
