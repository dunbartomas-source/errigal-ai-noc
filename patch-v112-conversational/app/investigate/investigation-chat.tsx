"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

const STARTERS = [
  {
    title: "Investigate an alarm",
    description: "Start with an alarm identifier and narrow down what has already been ruled out.",
    prompt:
      "Start a guided investigation for alarm identifier 9618. Ask me what I have already checked before recommending a resolution.",
  },
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

export default function InvestigationChat() {
  const { data, status, error, send, reset, cancel } = useEveAgent();
  const messages = (data?.messages ?? []) as any[];
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = ["submitted", "streaming", "resuming"].includes(status);

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
          onClick={() => {
            reset();
            setInput("");
          }}
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
            <div className={styles.stageItem} key={stage}>
              <span>{index + 1}</span>
              {stage}
            </div>
          ))}
        </div>

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
                Give me an alarm identifier, ticket, device, or symptom. I will establish the
                evidence, ask what you have already checked, and guide the investigation one
                decision at a time.
              </p>
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
                const visibleText = withoutControlMarker(rawText);
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
                      {visibleText ? <div className={styles.messageText}>{visibleText}</div> : null}
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
