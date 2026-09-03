"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useEveAgent } from "eve/react";
import styles from "./investigation-chat.module.css";

type ChecklistControl = {
  kind: "checklist";
  question: string;
  items: Array<{ id: string; label: string }>;
};

type ChoiceControl = {
  kind: "choices";
  question: string;
  choices: Array<{ id: string; label: string }>;
};

type InvestigationControl = ChecklistControl | ChoiceControl;

type InvestigationHistoryEntry = {
  sessionId: string;
  alarmIdentifier: string;
  stage: number;
  updatedAt: string;
};

const HISTORY_KEY = "errigal-ai-noc:investigation-history:v1";

const STARTERS = [
  {
    title: "Continue a ticket",
    description: "Use the incident evidence and continue from the operator's current progress.",
    prompt:
      "I want to continue an existing incident ticket. Ask for the minimum identifier you need, then guide me one step at a time.",
  },
  {
    title: "Correlate related alarms",
    description: "Check timing and topology before deciding whether alarms share one cause.",
    prompt:
      "Help me investigate several alarms that may be related. Establish the incident context, then determine whether they have a common upstream cause.",
  },
  {
    title: "Find proven resolutions",
    description: "Only after OEM checks, compare tenant history and anonymized Errigal-wide patterns.",
    prompt:
      "Guide me through the approved OEM checks first. If those do not resolve it, compare the closest resolved cases without exposing other customers.",
  },
] as const;

const CHECK_STATUSES = [
  ["completed_passed", "Completed - passed"],
  ["completed_no_change", "Completed - no change"],
  ["not_completed", "Not completed"],
  ["not_applicable", "Not applicable"],
  ["not_sure", "Not sure"],
] as const;

function textFromMessage(message: any): string {
  if (!Array.isArray(message?.parts)) return "";
  return message.parts
    .filter((part: any) => part?.type === "text")
    .map((part: any) => part.text ?? part.delta ?? "")
    .join("");
}

function toolLabelsFromMessage(message: any): string[] {
  if (!Array.isArray(message?.parts)) return [];
  const labels = new Set<string>();

  for (const part of message.parts) {
    if (part?.type !== "dynamic-tool") continue;
    const name = String(part.toolName ?? part?.toolMetadata?.eve?.name ?? "");
    const settled = [
      "output-available",
      "output-error",
      "output-denied",
      "approval-responded",
    ].includes(String(part.state));
    if (!settled) continue;

    if (name.includes("get_copilot_incident_evidence_pack")) {
      labels.add("Incident evidence loaded");
    } else if (name.includes("update_investigation_state")) {
      labels.add("Investigation progress saved");
    } else if (name.includes("agent")) {
      labels.add("Specialist analysis completed");
    }
  }

  return [...labels];
}

function parseJsonAfterPrefix(line: string, prefix: string): unknown {
  const index = line.indexOf(prefix);
  if (index < 0) return null;
  const candidate = line.slice(index + prefix.length).trim().replace(/^`+|`+$/g, "");
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function parseControl(text: string): InvestigationControl | null {
  for (const line of text.split("\n")) {
    const checklist = parseJsonAfterPrefix(line, "AI_NOC_CHECKLIST:") as any;
    if (
      checklist &&
      typeof checklist.question === "string" &&
      Array.isArray(checklist.items) &&
      checklist.items.every(
        (item: any) => typeof item?.id === "string" && typeof item?.label === "string",
      )
    ) {
      return {
        kind: "checklist",
        question: checklist.question,
        items: checklist.items,
      };
    }

    const choices = parseJsonAfterPrefix(line, "AI_NOC_CHOICES:") as any;
    if (
      choices &&
      typeof choices.question === "string" &&
      Array.isArray(choices.choices) &&
      choices.choices.every(
        (choice: any) =>
          typeof choice?.id === "string" && typeof choice?.label === "string",
      )
    ) {
      return {
        kind: "choices",
        question: choices.question,
        choices: choices.choices,
      };
    }
  }
  return null;
}

function withoutControlMarker(text: string): string {
  return text
    .split("\n")
    .filter(
      (line) =>
        !line.includes("AI_NOC_CHECKLIST:") && !line.includes("AI_NOC_CHOICES:"),
    )
    .join("\n")
    .trim();
}

function operatorFacingText(text: string): string {
  const cleaned = withoutControlMarker(text);
  const headingIndex = cleaned.search(/^#{1,4}\s+/m);
  if (headingIndex <= 0) return cleaned;

  const preamble = cleaned.slice(0, headingIndex);
  const soundsLikeInternalNarration =
    /\b(let me|i(?:'ll| will) (?:start|load|persist|invoke)|i have the skill|now (?:let me|i)|the lookup returned|state persisted|per the skill)\b/i.test(
      preamble,
    );

  return soundsLikeInternalNarration ? cleaned.slice(headingIndex).trim() : cleaned;
}

function alarmIdentifierFromMessages(messages: any[]): string {
  for (const message of messages) {
    const match = textFromMessage(message).match(/Alarm identifier\s+([^\s.,]+)/i);
    if (match) return match[1];
  }
  return "Unidentified alarm";
}

function investigationStage(messages: any[]): number {
  const text = messages.map(textFromMessage).join("\n").toLowerCase();
  if (/resolution intelligence|past resolutions|historical resolution|resolution-validation|verified recovery/.test(text)) return 5;
  if (/correlation|root cause analyst/.test(text)) return 4;
  if (/universal context|network context|context investigation/.test(text)) return 3;
  if (/oem|trap knowledge|approved checklist|ai_noc_checklist/.test(text)) return 2;
  return 1;
}

function historyFromStorage(): InvestigationHistoryEntry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is InvestigationHistoryEntry =>
          typeof item?.sessionId === "string" &&
          typeof item?.alarmIdentifier === "string" &&
          Number.isInteger(item?.stage) &&
          item.stage >= 1 &&
          item.stage <= 5 &&
          typeof item?.updatedAt === "string",
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
      }
      return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
    });
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      const Heading = `h${level}` as "h2" | "h3" | "h4";
      blocks.push(<Heading key={`heading-${index}`}>{renderInlineMarkdown(heading[2])}</Heading>);
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className={styles.tableWrap} key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInlineMarkdown(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^[-*]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}</ul>);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      blocks.push(<ol key={`ordered-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}</ol>);
      continue;
    }

    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInlineMarkdown(quote.join(" "))}</blockquote>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index].trim();
      if (/^(#{1,4})\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+[.)]\s+/.test(next) || next.startsWith(">") || /^-{3,}$/.test(next) || (next.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]))) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInlineMarkdown(paragraph.join(" "))}</p>);
  }

  return <div className={styles.markdown}>{blocks}</div>;
}

function ChecklistCard({
  control,
  disabled,
  onSend,
}: {
  control: ChecklistControl;
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const complete = control.items.every((item) => Boolean(statuses[item.id]));

  async function submit() {
    if (!complete || disabled) return;
    const results = control.items.map((item) => {
      const status = CHECK_STATUSES.find(([id]) => id === statuses[item.id])?.[1];
      return `- ${item.id}: ${item.label} — ${status ?? statuses[item.id]}`;
    });
    const noteBlock = notes.trim() ? `\nAdditional observation: ${notes.trim()}` : "";
    await onSend(
      `Operator checklist update for "${control.question}":\n${results.join("\n")}${noteBlock}`,
    );
  }

  return (
    <div className={styles.controlCard}>
      <div className={styles.controlEyebrow}>Operator checkpoint</div>
      <h3>{control.question}</h3>
      <div className={styles.checklistRows}>
        {control.items.map((item) => (
          <label className={styles.checklistRow} key={item.id}>
            <span className={styles.checkId}>{item.id}</span>
            <span className={styles.checkLabel}>{item.label}</span>
            <select
              aria-label={`Status for ${item.label}`}
              disabled={disabled}
              value={statuses[item.id] ?? ""}
              onChange={(event) =>
                setStatuses((current) => ({
                  ...current,
                  [item.id]: event.target.value,
                }))
              }
            >
              <option value="">Select status</option>
              {CHECK_STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <textarea
        className={styles.controlNotes}
        disabled={disabled}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Optional reading, observation, or result"
        rows={2}
        value={notes}
      />
      <button
        className={styles.primaryButton}
        disabled={!complete || disabled}
        onClick={() => void submit()}
        type="button"
      >
        Continue investigation
      </button>
    </div>
  );
}

function ChoiceCard({
  control,
  disabled,
  onSend,
}: {
  control: ChoiceControl;
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}) {
  return (
    <div className={styles.controlCard}>
      <div className={styles.controlEyebrow}>Confirmation required</div>
      <h3>{control.question}</h3>
      <div className={styles.choiceGrid}>
        {control.choices.map((choice) => (
          <button
            className={styles.choiceButton}
            disabled={disabled}
            key={choice.id}
            onClick={() =>
              void onSend(
                `Operator response to "${control.question}": ${choice.label}.`,
              )
            }
            type="button"
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InvestigationChat({ sessionId }: { sessionId?: string }) {
  const [history, setHistory] = useState<InvestigationHistoryEntry[]>([]);
  const { data, status, error, send, session, cancel } = useEveAgent({
    initialSession: sessionId ? { sessionId, streamIndex: 0 } : undefined,
    resume: Boolean(sessionId),
    onSessionChange(nextSession) {
      if (!sessionId && nextSession) {
        History.prototype.replaceState.call(
          window.history,
          window.history.state,
          "",
          `/?session=${encodeURIComponent(nextSession.sessionId)}`,
        );
      }
    },
  });
  const messages = (data?.messages ?? []) as any[];
  const [input, setInput] = useState("");
  const [alarmInput, setAlarmInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = ["submitted", "streaming", "resuming"].includes(status);
  const activeSessionId = sessionId ?? session?.sessionId;
  const currentAlarmIdentifier = useMemo(
    () => alarmIdentifierFromMessages(messages),
    [messages],
  );
  const currentStage = useMemo(() => investigationStage(messages), [messages]);

  useEffect(() => {
    setHistory(historyFromStorage());
  }, []);

  useEffect(() => {
    if (!activeSessionId || messages.length === 0 || busy) return;
    const entry: InvestigationHistoryEntry = {
      sessionId: activeSessionId,
      alarmIdentifier: currentAlarmIdentifier,
      stage: currentStage,
      updatedAt: new Date().toISOString(),
    };
    setHistory((current) => {
      const next = [
        entry,
        ...current.filter((item) => item.sessionId !== activeSessionId),
      ].slice(0, 8);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [activeSessionId, busy, currentAlarmIdentifier, currentStage, messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  const latestAssistantId = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.id,
    [messages],
  );

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setInput("");
    await send(trimmed);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function startAlarmInvestigation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const alarmIdentifier = alarmInput.trim().replace(/\s+/g, " ");
    if (!alarmIdentifier || busy) return;
    void sendMessage(
      `ENTRY_MODE: full. Alarm identifier ${alarmIdentifier}. I have not completed any OEM troubleshooting yet. Start with the exact Trap Knowledge lookup, show the approved checklist, and guide me one step at a time.`,
    );
  }

  function startDemoInvestigation() {
    if (busy) return;
    void sendMessage(
      "ENTRY_MODE: full. Alarm identifier DEMO-PWR-FAIL. This is the clearly labelled synthetic demo incident. I have not completed any OEM troubleshooting yet. Start with the demo Trap Knowledge checklist and guide me one step at a time.",
    );
  }

  function downloadSummary() {
    const exportedAt = new Date();
    const stages = [
      "Identify the incident",
      "OEM troubleshooting",
      "Investigate network context",
      "Correlate when needed",
      "Resolve and verify",
    ];
    const record = messages.flatMap((message) => {
      const text = operatorFacingText(textFromMessage(message));
      if (!text) return [];
      const role = message.role === "user" ? "Operator" : "AI-NOC Copilot";
      const cleanText = text.startsWith("ENTRY_MODE:")
        ? `Investigation started for alarm **${currentAlarmIdentifier}**.`
        : text;
      return [`### ${role}\n\n${cleanText}`];
    });
    const summary = [
      "# Errigal AI-NOC Incident Handover",
      "",
      `- **Alarm identifier:** ${currentAlarmIdentifier}`,
      `- **Current stage:** ${currentStage} of 5 — ${stages[currentStage - 1]}`,
      `- **Exported:** ${exportedAt.toLocaleString()}`,
      `- **Session reference:** ${activeSessionId ?? "Not yet assigned"}`,
      "",
      "## Investigation record",
      "",
      ...record,
      "",
      "---",
      "Generated by the read-only Errigal AI-NOC Investigator. Recommendations remain hypotheses until verified by an operator.",
    ].join("\n");
    const blob = new Blob([summary], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `errigal-ai-noc-${currentAlarmIdentifier}-${exportedAt.toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brandMark}>E</div>
          <div className={styles.brandCopy}>
            <strong>Errigal AI-NOC</strong>
            <span>Guided Investigation</span>
          </div>
        </div>

        <button
          className={styles.newButton}
          onClick={() => window.location.assign("/")}
          type="button"
        >
          <span>+</span> New investigation
        </button>

        <div className={styles.stagePanel}>
          <div className={styles.sideHeading}>Investigation flow</div>
          {[
            "Identify the incident",
            "Review OEM checks",
            "Narrow likely causes",
            "Compare resolved cases",
            "Verify or escalate",
          ].map((stage, index) => (
            <div
              className={`${styles.stageItem} ${index + 1 === currentStage ? styles.stageActive : ""} ${index + 1 < currentStage ? styles.stageComplete : ""}`}
              key={stage}
            >
              <span>{index + 1}</span>
              {stage}
            </div>
          ))}
        </div>

        {history.length ? (
          <div className={styles.historyPanel}>
            <div className={styles.sideHeading}>Recent investigations</div>
            {history.slice(0, 4).map((item) => (
              <button
                className={styles.historyItem}
                key={item.sessionId}
                onClick={() =>
                  window.location.assign(`/?session=${encodeURIComponent(item.sessionId)}`)
                }
                type="button"
              >
                <strong>{item.alarmIdentifier}</strong>
                <span>
                  Stage {item.stage} · {new Date(item.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.safetyCard}>
          <span className={styles.safetyDot} />
          <div>
            <strong>Read-only copilot</strong>
            <p>Guides and drafts only. It does not change devices, alarms, or tickets.</p>
          </div>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <div className={styles.headerEyebrow}>AI-NOC COPILOT</div>
            <h1>Incident investigation</h1>
          </div>
          <div className={styles.statusGroup}>
            {messages.length ? (
              <button className={styles.headerButton} onClick={downloadSummary} type="button">
                Download handover
              </button>
            ) : null}
            <span className={`${styles.statusPill} ${busy ? styles.statusBusy : ""}`}>
              <span />
              {status === "streaming"
                ? "Analysing"
                : status === "submitted"
                  ? "Starting"
                  : status === "resuming"
                    ? "Resuming"
                    : status === "error"
                      ? "Needs attention"
                      : "Ready"}
            </span>
            {busy ? (
              <button className={styles.headerButton} onClick={() => void cancel()} type="button">
                Stop
              </button>
            ) : null}
          </div>
        </header>

        <div className={styles.thread}>
          {messages.length === 0 ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeMark}>AI</div>
              <h2>What are you investigating?</h2>
              <p>
                Start with the alarm identifier. I will retrieve the approved OEM guidance,
                record the checks already completed, and then investigate network context only
                when the first-line procedure is exhausted.
              </p>
              <div className={styles.alarmStartCard}>
                <div className={styles.alarmStartHeading}>
                  <div>
                    <strong>Start Full AI-NOC Investigation</strong>
                    <span>Exact Trap Knowledge lookup — no fuzzy matching</span>
                  </div>
                  <b>Step 1 of 5</b>
                </div>
                <form className={styles.alarmStartForm} onSubmit={startAlarmInvestigation}>
                  <label htmlFor="alarm-identifier">Alarm identifier</label>
                  <div>
                    <input
                      autoComplete="off"
                      disabled={busy}
                      id="alarm-identifier"
                      maxLength={100}
                      onChange={(event) => setAlarmInput(event.target.value)}
                      placeholder="Enter the exact alarm identifier"
                      value={alarmInput}
                    />
                    <button disabled={busy || !alarmInput.trim()} type="submit">
                      Start investigation
                    </button>
                  </div>
                </form>
                <div className={styles.demoStartRow}>
                  <span>Need a guaranteed working walkthrough?</span>
                  <button disabled={busy} onClick={startDemoInvestigation} type="button">
                    Run demo alarm
                  </button>
                </div>
              </div>
              <div className={styles.otherPathsLabel}>Other entry points</div>
              <div className={styles.starterGrid}>
                {STARTERS.map((starter) => (
                  <button
                    className={styles.starterCard}
                    key={starter.title}
                    onClick={() => void sendMessage(starter.prompt)}
                    type="button"
                  >
                    <strong>{starter.title}</strong>
                    <span>{starter.description}</span>
                    <b>Start →</b>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.messageList}>
              {messages.map((message) => {
                const rawText = textFromMessage(message);
                const visibleText = operatorFacingText(rawText);
                const control = message.role === "assistant" ? parseControl(rawText) : null;
                const toolLabels = toolLabelsFromMessage(message);
                const isLatestAssistant = message.id === latestAssistantId;

                return (
                  <article
                    className={`${styles.message} ${
                      message.role === "user" ? styles.userMessage : styles.assistantMessage
                    }`}
                    key={message.id}
                  >
                    <div className={styles.avatar}>
                      {message.role === "user" ? "You" : "AI"}
                    </div>
                    <div className={styles.messageBody}>
                      <div className={styles.messageRole}>
                        {message.role === "user" ? "Operator" : "AI-NOC Copilot"}
                      </div>
                      {toolLabels.length ? (
                        <div className={styles.toolLabels}>
                          {toolLabels.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                      ) : null}
                      {visibleText ? (
                        <div className={styles.messageText}>
                          {message.role === "assistant" ? (
                            <MarkdownMessage content={visibleText} />
                          ) : (
                            visibleText
                          )}
                        </div>
                      ) : null}
                      {control?.kind === "checklist" ? (
                        <ChecklistCard
                          control={control}
                          disabled={busy || !isLatestAssistant}
                          onSend={sendMessage}
                        />
                      ) : null}
                      {control?.kind === "choices" ? (
                        <ChoiceCard
                          control={control}
                          disabled={busy || !isLatestAssistant}
                          onSend={sendMessage}
                        />
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {busy ? (
                <div className={styles.thinkingRow}>
                  <span /> <span /> <span />
                  <b>The copilot is reviewing the next safest step</b>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <div className={styles.errorBanner}>
              The investigation could not continue: {String((error as any)?.message ?? error)}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        <div className={styles.composerWrap}>
          <form className={styles.composer} onSubmit={submit}>
            <textarea
              aria-label="Message the AI-NOC Copilot"
              disabled={busy}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim()) void sendMessage(input);
                }
              }}
              placeholder="Enter an alarm identifier, describe what you checked, or report the result…"
              rows={1}
              value={input}
            />
            <button disabled={busy || !input.trim()} type="submit">
              Send
            </button>
          </form>
          <p>
            Recommendations are evidence-led hypotheses until verified by an operator. No
            remediation is executed automatically.
          </p>
        </div>
      </section>
    </main>
  );
}
